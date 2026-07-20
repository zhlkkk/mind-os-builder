from mind_os_builder.research.contracts import ResearchProvider
from mind_os_builder.research.models import ProviderResult, ProviderStatus, ResearchRequest


class Provider:
    name = "fixture"

    def run(self, request: ResearchRequest) -> ProviderResult:
        return ProviderResult(self.name, ProviderStatus.SUCCEEDED, request.topic)


def test_provider_protocol_is_runtime_checkable() -> None:
    assert isinstance(Provider(), ResearchProvider)
