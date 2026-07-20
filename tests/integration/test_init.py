from mind_os_builder.wiki.init import initialize_vault


def test_init_empty_directory_then_noop(tmp_path) -> None:
    target = tmp_path / "vault"
    first = initialize_vault(target, apply=True)
    assert first.changed is True
    assert (target / "AGENTS.md").exists()
    assert (target / "wiki/index.md").exists()
    second = initialize_vault(target, apply=True)
    assert second.changed is False
    assert second.reason_code == "noop"


def test_init_dry_run_writes_nothing(tmp_path) -> None:
    target = tmp_path / "vault"
    result = initialize_vault(target, apply=False)
    assert result.changed is True
    assert not target.exists()


def test_init_stops_on_unknown_content(tmp_path) -> None:
    target = tmp_path / "vault"
    target.mkdir()
    (target / "mine.md").write_text("keep", encoding="utf-8")
    result = initialize_vault(target, apply=True)
    assert result.reason_code == "conflict"
    assert (target / "mine.md").read_text(encoding="utf-8") == "keep"
