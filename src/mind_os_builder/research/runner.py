from __future__ import annotations

import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import date
from pathlib import Path

from mind_os_builder.core.results import RunEnvelope, RunStatus
from mind_os_builder.core.write_guard import WriteGuard
from mind_os_builder.research.contracts import ResearchProvider
from mind_os_builder.research.models import (
    ProviderResult,
    ProviderStatus,
    ResearchEvent,
    ResearchRequest,
)
from mind_os_builder.research.prompts import compact
from mind_os_builder.research.report import render_report
from mind_os_builder.research.router import select_providers


@dataclass(slots=True)
class CancellationToken:
    cancelled: bool = False

    def cancel(self) -> None:
        self.cancelled = True


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff]+", "-", value.lower()).strip("-")
    return slug[:80] or "research"


class ResearchRunner:
    def __init__(self, providers: Sequence[ResearchProvider]) -> None:
        self.providers = {provider.name: provider for provider in providers}

    def run(
        self,
        request: ResearchRequest,
        *,
        vault_root: Path,
        apply: bool = False,
        progress: Callable[[ResearchEvent], None] | None = None,
        cancellation: CancellationToken | None = None,
        resumed_results: Mapping[str, ProviderResult] | None = None,
    ) -> RunEnvelope:
        emit = progress or (lambda _event: None)
        if request.requested_providers:
            provider_names = list(dict.fromkeys(request.requested_providers))
            unknown = [name for name in provider_names if name not in self.providers]
            if unknown:
                return RunEnvelope.blocked(
                    "research.run",
                    "config_error",
                    f"未知 research provider：{', '.join(unknown)}",
                )
        else:
            provider_names = select_providers(request.mode, self.providers)
        results: list[ProviderResult] = []
        resumed = resumed_results or {}
        for name in provider_names:
            if cancellation and cancellation.cancelled:
                return RunEnvelope(
                    task="research.run",
                    status=RunStatus.CANCELLED,
                    reason_code="cancelled",
                    warnings=["checkpoint retained for a new resumed run"],
                    metrics={"completed_providers": len(results)},
                )
            if name in resumed:
                results.append(resumed[name])
                emit(ResearchEvent("provider_finished", name, "reused checkpoint"))
                continue
            emit(ResearchEvent("provider_started", name))
            try:
                context_limit = {"openrouter": 14000, "google": 22000}.get(name)
                provider_request = request
                if context_limit is not None:
                    provider_request = replace(
                        request,
                        context=_render_context(results, context_limit),
                    )
                result = self.providers[name].run(provider_request)
            except Exception:  # provider isolation boundary
                safe_error = "provider execution failed"
                result = ProviderResult(
                    name,
                    ProviderStatus.FAILED,
                    "",
                    error=safe_error,
                )
                emit(ResearchEvent("provider_failed", name, safe_error))
            else:
                if result.ok and result.content.strip():
                    emit(ResearchEvent("provider_finished", name))
                elif result.status is ProviderStatus.SKIPPED:
                    emit(ResearchEvent("provider_skipped", name, result.error or "provider skipped"))
                else:
                    if result.ok:
                        result = ProviderResult(
                            name,
                            ProviderStatus.FAILED,
                            "",
                            error="invalid_response",
                            metadata=result.metadata,
                        )
                    emit(
                        ResearchEvent(
                            "provider_failed",
                            name,
                            result.error or "provider failed",
                        )
                    )
            results.append(result)
        succeeded = [result for result in results if result.ok and result.content.strip()]
        skipped = [result for result in results if result.status is ProviderStatus.SKIPPED]
        failures = [result for result in results if result.status is ProviderStatus.FAILED]
        if not succeeded:
            return RunEnvelope(
                task="research.run",
                status=RunStatus.FAILED,
                reason_code="providers_unavailable",
                errors=[
                    {
                        "code": "providers_unavailable",
                        "message": "all research providers were skipped or failed",
                    }
                ],
                metrics={
                    "providers_succeeded": 0,
                    "providers_skipped": len(skipped),
                    "providers_failed": len(failures),
                },
            )
        report = render_report(request, results)
        emit(ResearchEvent("report_validated"))
        relative = Path("raw/research") / f"{date.today().isoformat()}-{_slug(request.topic)}.md"
        artifacts: list[str] = []
        changed = False
        reason_code: str | None = "dry_run"
        if apply:
            WriteGuard(vault_root).atomic_write(relative, report, capability="research")
            artifacts.append(relative.as_posix())
            changed = True
            reason_code = "provider_partial" if skipped or failures else None
            emit(ResearchEvent("promoted"))
        incomplete = [*skipped, *failures]
        status = RunStatus.PARTIAL if incomplete else RunStatus.SUCCEEDED
        return RunEnvelope(
            task="research.run",
            status=status,
            reason_code=reason_code,
            changed=changed,
            artifacts=artifacts,
            warnings=[f"{len(incomplete)} provider(s) skipped or failed"] if incomplete else [],
            metrics={
                "providers_succeeded": len(succeeded),
                "providers_skipped": len(skipped),
                "providers_failed": len(failures),
            },
        )


def _render_context(results: Sequence[ProviderResult], limit: int) -> str:
    succeeded = [
        result for result in results if result.ok and result.content.strip()
    ]
    if not succeeded:
        return ""
    separator = "\n\n"
    available = limit - len(separator) * (len(succeeded) - 1)
    section_limit, remainder = divmod(available, len(succeeded))
    sections = [
        compact(
            f"## {result.name} [{result.status.value}]\n\n{result.content.strip()}",
            section_limit + (index < remainder),
        )
        for index, result in enumerate(succeeded)
    ]
    return separator.join(sections)
