from __future__ import annotations

import json
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from mind_os_builder.collect.contracts import Provider, ProviderError
from mind_os_builder.collect.cursors import CursorStore
from mind_os_builder.collect.filters.llm_review import (
    ReviewUnavailable,
    Reviewer,
    review_signals,
)
from mind_os_builder.collect.filters.rules import FilterConfig, filter_signals
from mind_os_builder.collect.models import Signal, normalize_records
from mind_os_builder.collect.renderers.brief import merge_brief, render_brief, validate_brief
from mind_os_builder.core.locks import FileLock
from mind_os_builder.core.results import RunEnvelope, RunStatus
from mind_os_builder.core.write_guard import PathViolation, WriteGuard


@dataclass(frozen=True, slots=True)
class CollectResult:
    envelope: RunEnvelope
    markdown: str
    signals: tuple[Signal, ...]
    report: dict[str, Any]


def _deduplicate(signals: list[Signal]) -> list[Signal]:
    unique: dict[tuple[str, str], Signal] = {}
    for signal in signals:
        unique.setdefault((signal.source, signal.id), signal)
    return list(unique.values())


def _write_json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


class CollectPipeline:
    def __init__(
        self,
        vault_root: Path,
        provider: Provider,
        filters: FilterConfig,
        *,
        reviewer: Reviewer | None = None,
        review_unavailable: str = "heuristic",
    ) -> None:
        self._root = vault_root
        self._provider = provider
        self._filters = filters
        self._reviewer = reviewer
        self._review_unavailable = review_unavailable
        self.cursor_store = CursorStore(vault_root)

    def run(self, *, output: str, apply: bool, keep_work_dir: Path | None = None) -> CollectResult:
        task = f"collect.{self._provider.capability.source}"
        report: dict[str, Any] = {"stages": {}, "filter_reasons": {}, "review_reasons": {}}
        markdown = ""
        reviewed: tuple[Signal, ...] = ()
        temporary: tempfile.TemporaryDirectory[str] | None = None
        if keep_work_dir is None:
            temporary = tempfile.TemporaryDirectory(prefix="mindos-collect-")
            work_dir = Path(temporary.name)
        else:
            keep_work_dir.mkdir(parents=True, exist_ok=True)
            work_dir = keep_work_dir

        try:
            cursor = self.cursor_store.get(self._provider.name)
            batch = self._provider.fetch(cursor)
            report["stages"]["fetched"] = len(batch.records)
            _write_json(work_dir / "fetch.json", {"records": list(batch.records)})

            normalized = _deduplicate(
                normalize_records(self._provider.capability.source, batch.records)
            )
            report["stages"]["normalized"] = len(normalized)
            _write_json(work_dir / "normalize.json", [signal.to_dict() for signal in normalized])

            filtered = filter_signals(normalized, self._filters)
            report["stages"]["filtered"] = len(filtered.accepted)
            report["filter_reasons"] = {
                signal_id: list(reasons) for signal_id, reasons in filtered.reasons.items()
            }
            _write_json(
                work_dir / "filter.json",
                {
                    "accepted": [signal.id for signal in filtered.accepted],
                    "reasons": report["filter_reasons"],
                    "scores": dict(filtered.scores),
                    "counts": dict(filtered.counts),
                },
            )

            review = review_signals(
                filtered.accepted,
                self._reviewer,
                unavailable=self._review_unavailable,
            )
            reviewed = review.accepted
            report["stages"]["reviewed"] = len(reviewed)
            report["review_reasons"] = {
                signal_id: list(reasons) for signal_id, reasons in review.reasons.items()
            }
            _write_json(
                work_dir / "review.json",
                {"accepted": [signal.id for signal in reviewed], "reasons": report["review_reasons"]},
            )

            markdown = render_brief(reviewed)
            report["stages"]["rendered"] = len(reviewed)
            (work_dir / "brief.md").write_text(markdown, encoding="utf-8")
            validation_errors = validate_brief(markdown, reviewed)
            _write_json(work_dir / "validation.json", {"errors": validation_errors})
            if validation_errors:
                return self._failed(
                    task,
                    "validation_failed",
                    validation_errors,
                    markdown,
                    reviewed,
                    report,
                    batch.warnings + review.warnings,
                )

            if not apply:
                envelope = RunEnvelope(
                    task=task,
                    status=RunStatus.SUCCEEDED,
                    changed=False,
                    warnings=list(batch.warnings + review.warnings),
                    metrics=report,
                )
                return CollectResult(envelope, markdown, reviewed, report)

            relative = Path(output)
            guard = WriteGuard(self._root)
            target = guard.resolve(relative)
            lock_name = relative.as_posix().replace("/", "-") + ".lock"
            with FileLock(self._root / ".mindos/locks" / lock_name):
                existing = target.read_text(encoding="utf-8") if target.exists() else ""
                if existing:
                    promoted, additions = merge_brief(existing, reviewed)
                else:
                    promoted, additions = markdown, reviewed
                final_errors = validate_brief(promoted, additions)
                if final_errors:
                    return self._failed(
                        task,
                        "validation_failed",
                        final_errors,
                        promoted,
                        additions,
                        report,
                        batch.warnings + review.warnings,
                    )
                if promoted != existing:
                    guard.atomic_write(relative, promoted)
            if batch.next_cursor is not None:
                self.cursor_store.commit(self._provider.name, batch.next_cursor)
            envelope = RunEnvelope(
                task=task,
                status=RunStatus.SUCCEEDED,
                changed=bool(additions),
                artifacts=[relative.as_posix()],
                warnings=list(batch.warnings + review.warnings),
                metrics=report,
            )
            return CollectResult(envelope, promoted, tuple(additions), report)
        except ProviderError as exc:
            return self._failed(task, exc.code, (str(exc),), markdown, reviewed, report)
        except ReviewUnavailable:
            return self._failed(
                task,
                "llm_review_unavailable",
                ("LLM review is unavailable",),
                markdown,
                reviewed,
                report,
            )
        except (PathViolation, OSError) as exc:
            return self._failed(
                task,
                "promotion_failed",
                (str(exc),),
                markdown,
                reviewed,
                report,
            )
        finally:
            if temporary is not None:
                temporary.cleanup()

    @staticmethod
    def _failed(
        task: str,
        reason_code: str,
        errors: tuple[str, ...],
        markdown: str,
        signals: tuple[Signal, ...],
        report: dict[str, Any],
        warnings: tuple[str, ...] = (),
    ) -> CollectResult:
        envelope = RunEnvelope(
            task=task,
            status=RunStatus.FAILED,
            reason_code=reason_code,
            warnings=list(warnings),
            errors=[{"code": reason_code, "message": message} for message in errors],
            metrics=report,
        )
        return CollectResult(envelope, markdown, signals, report)
