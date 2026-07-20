from mind_os_builder.research.models import ProviderResult, ResearchMode, ResearchRequest
from mind_os_builder.research.runner import ResearchRunner


class GoodProvider:
    name = "search"
    capabilities = frozenset({"search"})

    def run(self, request: ResearchRequest) -> ProviderResult:
        return ProviderResult(self.name, True, f"关于 {request.topic} 的证据", citations=["https://example.test"])


class BadProvider:
    name = "deep"
    capabilities = frozenset({"deep"})

    def run(self, request: ResearchRequest) -> ProviderResult:
        raise TimeoutError("provider timed out")


class LeakyProvider:
    name = "search"
    capabilities = frozenset({"search"})

    def run(self, request: ResearchRequest) -> ProviderResult:
        raise RuntimeError("request failed with token=synthetic-secret")


class NamedProvider:
    capabilities = frozenset({"search"})

    def __init__(self, name: str, calls: list[str]) -> None:
        self.name = name
        self._calls = calls

    def run(self, request: ResearchRequest) -> ProviderResult:
        self._calls.append(self.name)
        return ProviderResult(self.name, True, f"{self.name}: {request.topic}")


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
