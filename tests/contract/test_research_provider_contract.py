from mind_os_builder.research.contracts import ResearchProvider
from mind_os_builder.research.models import ProviderResult, ResearchRequest


class Provider:
    name = "fixture"
    capabilities = frozenset({"search"})

    def run(self, request: ResearchRequest) -> ProviderResult:
        return ProviderResult(self.name, True, request.topic)


def test_provider_protocol_is_runtime_checkable() -> None:
    assert isinstance(Provider(), ResearchProvider)
