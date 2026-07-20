from mind_os_builder.research.models import (
    ProviderResult,
    ProviderStatus,
    ResearchMode,
    ResearchRequest,
)
from mind_os_builder.research.report import render_report


def test_report_separates_evidence_and_provider_gaps() -> None:
    request = ResearchRequest("Agent Skills", ResearchMode.STANDARD)
    report = render_report(
        request,
        [
            ProviderResult(
                "search",
                ProviderStatus.SUCCEEDED,
                "事实 A",
                citations=["https://example.test/a"],
            ),
            ProviderResult(
                "deep",
                ProviderStatus.FAILED,
                "",
                error="timeout",
                metadata={"request_id": "req-deep", "last_status": "pending"},
            ),
        ],
    )
    assert "https://example.test/a" in report
    assert "deep: timeout" in report
    assert "request_id req-deep" in report
    assert "最后状态 pending" in report
    assert "模型草稿，不等于已验证事实" in report
