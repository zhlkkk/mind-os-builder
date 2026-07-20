from mind_os_builder.research.models import ProviderResult, ResearchMode, ResearchRequest
from mind_os_builder.research.report import render_report


def test_report_separates_evidence_and_provider_gaps() -> None:
    request = ResearchRequest("Agent Skills", ResearchMode.STANDARD)
    report = render_report(
        request,
        [
            ProviderResult("search", True, "事实 A", citations=["https://example.test/a"]),
            ProviderResult("deep", False, "", error="timeout"),
        ],
    )
    assert "https://example.test/a" in report
    assert "deep: timeout" in report
    assert "模型草稿，不等于已验证事实" in report
