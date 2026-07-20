from scripts.audit_release import audit_paths


def test_release_audit_flags_private_paths_and_secrets(tmp_path) -> None:
    bad = tmp_path / "bad.txt"
    secret = "sk-" + "secretvalue123456"
    private_path = "/Users/" + "alice/private/vault"
    bad.write_text(f"{private_path}\nOPENAI_API_KEY={secret}", encoding="utf-8")
    findings = audit_paths([bad])
    assert {finding.kind for finding in findings} == {"private_path", "secret"}


def test_release_audit_allows_synthetic_markdown(tmp_path) -> None:
    page = tmp_path / "README.md"
    page.write_text("# Synthetic example\n", encoding="utf-8")
    assert audit_paths([page]) == []
