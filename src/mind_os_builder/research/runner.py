from __future__ import annotations

import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from mind_os_builder.core.results import RunEnvelope, RunStatus
from mind_os_builder.core.write_guard import WriteGuard
from mind_os_builder.research.contracts import ResearchProvider
from mind_os_builder.research.models import ProviderResult, ResearchEvent, ResearchRequest
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
        capabilities = {
            capability
            for provider in self.providers.values()
            for capability in provider.capabilities
        }
        selected = select_providers(
            request.mode,
            capabilities,
            request.requested_providers or None,
        )
        provider_names = [
            provider.name
            for provider in self.providers.values()
            if provider.name in selected or provider.capabilities.intersection(selected)
        ]
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
                result = self.providers[name].run(request)
            except Exception:  # provider isolation boundary
                safe_error = "provider execution failed"
                result = ProviderResult(name, False, "", error=safe_error)
                emit(ResearchEvent("provider_failed", name, safe_error))
            else:
                if result.ok:
                    emit(ResearchEvent("provider_finished", name))
                else:
                    emit(ResearchEvent("provider_failed", name, result.error or "provider failed"))
            results.append(result)
        succeeded = [result for result in results if result.ok and result.content.strip()]
        failures = [result for result in results if not result.ok or not result.content.strip()]
        if not succeeded:
            return RunEnvelope(
                task="research.run",
                status=RunStatus.FAILED,
                reason_code="providers_unavailable",
                errors=[{"code": "providers_unavailable", "message": "all research providers failed"}],
                metrics={"providers_failed": len(failures)},
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
            reason_code = "provider_partial" if failures else None
            emit(ResearchEvent("promoted"))
        status = RunStatus.PARTIAL if failures else RunStatus.SUCCEEDED
        return RunEnvelope(
            task="research.run",
            status=status,
            reason_code=reason_code,
            changed=changed,
            artifacts=artifacts,
            warnings=[f"{len(failures)} provider(s) failed"] if failures else [],
            metrics={"providers_succeeded": len(succeeded), "providers_failed": len(failures)},
        )
