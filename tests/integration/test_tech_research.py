from mind_os_builder.research.models import (
    ProviderResult,
    ProviderStatus,
    ResearchMode,
    ResearchRequest,
)
from mind_os_builder.research.runner import ResearchRunner


class GoodProvider:
    name = "tavily-search"

    def run(self, request: ResearchRequest) -> ProviderResult:
        return ProviderResult(
            self.name,
            ProviderStatus.SUCCEEDED,
            f"关于 {request.topic} 的证据",
            citations=["https://example.test"],
        )


class BadProvider:
    name = "tavily-research"

    def run(self, request: ResearchRequest) -> ProviderResult:
        raise TimeoutError("provider timed out")


class LeakyProvider:
    name = "tavily-search"

    def run(self, request: ResearchRequest) -> ProviderResult:
        raise RuntimeError("request failed with token=synthetic-secret")


class EmptyProvider:
    name = "exa"

    def run(self, request: ResearchRequest) -> ProviderResult:
        return ProviderResult(self.name, ProviderStatus.SUCCEEDED, " \n")


class NamedProvider:
    def __init__(self, name: str, calls: list[str]) -> None:
        self.name = name
        self._calls = calls

    def run(self, request: ResearchRequest) -> ProviderResult:
        self._calls.append(self.name)
        return ProviderResult(
            self.name,
            ProviderStatus.SUCCEEDED,
            f"{self.name}: {request.topic}",
        )


class ContextProvider:
    def __init__(
        self,
        name: str,
        seen: dict[str, str],
        content: str | None = None,
    ) -> None:
        self.name = name
        self._seen = seen
        self._content = content or f"{name} evidence"

    def run(self, request: ResearchRequest) -> ProviderResult:
        self._seen[self.name] = request.context
        return ProviderResult(
            self.name,
            ProviderStatus.SUCCEEDED,
            self._content,
        )


def test_partial_provider_failure_is_visible_and_report_can_promote(tmp_path) -> None:
    events: list[str] = []
    runner = ResearchRunner([GoodProvider(), BadProvider()])
    result = runner.run(
        ResearchRequest("MCP", ResearchMode.DEEP),
        vault_root=tmp_path,
        apply=True,
        progress=lambda event: events.append(event.stage),
    )
    assert result.status.value == "partial"
    assert result.reason_code == "provider_partial"
    assert (tmp_path / result.artifacts[0]).exists()
    assert events == ["provider_started", "provider_finished", "provider_started", "provider_failed", "report_validated", "promoted"]


def test_all_provider_failures_do_not_create_formal_report(tmp_path) -> None:
    result = ResearchRunner([BadProvider()]).run(
        ResearchRequest("MCP", ResearchMode.DEEP), vault_root=tmp_path, apply=True
    )
    assert result.status.value == "failed"
    assert not (tmp_path / "raw/research").exists()


def test_empty_success_as_only_provider_does_not_create_report(tmp_path) -> None:
    result = ResearchRunner([EmptyProvider()]).run(
        ResearchRequest("MCP", requested_providers=("exa",)),
        vault_root=tmp_path,
        apply=True,
    )

    assert result.status.value == "failed"
    assert result.reason_code == "providers_unavailable"
    assert result.metrics["providers_failed"] == 1
    assert not (tmp_path / "raw/research").exists()


def test_empty_success_with_valid_provider_is_partial(tmp_path) -> None:
    result = ResearchRunner([GoodProvider(), EmptyProvider()]).run(
        ResearchRequest(
            "MCP",
            requested_providers=("tavily-search", "exa"),
        ),
        vault_root=tmp_path,
        apply=True,
    )

    assert result.status.value == "partial"
    assert result.reason_code == "provider_partial"
    assert result.metrics["providers_succeeded"] == 1
    assert result.metrics["providers_failed"] == 1
    assert (tmp_path / result.artifacts[0]).exists()


def test_provider_exception_details_are_not_exposed(tmp_path) -> None:
    events: list[str] = []

    result = ResearchRunner([LeakyProvider()]).run(
        ResearchRequest("MCP", ResearchMode.QUICK),
        vault_root=tmp_path,
        progress=lambda event: events.append(event.message),
    )

    payload = str(result.to_dict()) + " ".join(events)
    assert "synthetic-secret" not in payload
    assert "provider execution failed" in payload


def test_explicit_provider_names_are_selected_in_request_order(tmp_path) -> None:
    calls: list[str] = []
    runner = ResearchRunner(
        [NamedProvider("first-api", calls), NamedProvider("second-api", calls)]
    )

    result = runner.run(
        ResearchRequest(
            "MCP",
            ResearchMode.QUICK,
            requested_providers=("second-api", "first-api"),
        ),
        vault_root=tmp_path,
    )

    assert result.status.value == "succeeded"
    assert calls == ["second-api", "first-api"]


def test_unknown_explicit_provider_returns_config_error(tmp_path) -> None:
    calls: list[str] = []
    result = ResearchRunner([NamedProvider("known-api", calls)]).run(
        ResearchRequest(
            "MCP",
            ResearchMode.QUICK,
            requested_providers=("missing-api",),
        ),
        vault_root=tmp_path,
    )

    assert result.status.value == "blocked"
    assert result.reason_code == "config_error"
    assert "missing-api" in result.errors[0]["message"]
    assert calls == []


def test_runner_passes_each_result_to_later_providers(tmp_path) -> None:
    seen: dict[str, str] = {}
    runner = ResearchRunner(
        [
            ContextProvider("tavily-search", seen),
            ContextProvider("openrouter", seen),
            ContextProvider("google", seen),
        ]
    )

    result = runner.run(
        ResearchRequest(
            "MCP",
            requested_providers=("tavily-search", "openrouter", "google"),
        ),
        vault_root=tmp_path,
    )

    assert result.status.value == "succeeded"
    assert seen["tavily-search"] == ""
    assert "tavily-search evidence" in seen["openrouter"]
    assert "tavily-search evidence" in seen["google"]
    assert "openrouter evidence" in seen["google"]


def test_runner_preserves_each_successful_provider_within_context_budget(tmp_path) -> None:
    seen: dict[str, str] = {}
    early_evidence = "EARLY-EVIDENCE\n" + "A" * 30000
    runner = ResearchRunner(
        [
            ContextProvider("tavily-search", seen, early_evidence),
            BadProvider(),
            ContextProvider("openrouter", seen, "OPENROUTER-COUNTERPOINT"),
            ContextProvider("google", seen),
        ]
    )

    result = runner.run(
        ResearchRequest(
            "MCP",
            requested_providers=(
                "tavily-search",
                "tavily-research",
                "openrouter",
                "google",
            ),
        ),
        vault_root=tmp_path,
    )

    assert result.status.value == "partial"
    assert len(seen["openrouter"]) <= 14000
    assert "EARLY-EVIDENCE" in seen["openrouter"]
    assert len(seen["google"]) <= 22000
    assert "EARLY-EVIDENCE" in seen["google"]
    assert "## openrouter [succeeded]" in seen["google"]
    assert "OPENROUTER-COUNTERPOINT" in seen["google"]
    assert "tavily-research" not in seen["google"]
    assert "provider execution failed" not in seen["google"]
