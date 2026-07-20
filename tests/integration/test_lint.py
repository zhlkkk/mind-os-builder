from mind_os_builder.wiki.init import initialize_vault
from mind_os_builder.wiki.lint import lint_vault


def test_initialized_vault_has_no_lint_errors(tmp_path) -> None:
    vault = tmp_path / "vault"
    initialize_vault(vault, apply=True)
    report = lint_vault(vault)
    assert report.error_count == 0


def test_lint_reports_frontmatter_red_links_and_index_gap(tmp_path) -> None:
    vault = tmp_path / "vault"
    initialize_vault(vault, apply=True)
    page = vault / "wiki/concepts/broken.md"
    page.write_text("# Broken\n\n[[missing-page]]\n", encoding="utf-8")
    report = lint_vault(vault)
    codes = {issue.code for issue in report.issues}
    assert {"frontmatter_missing", "red_link", "index_missing"} <= codes
