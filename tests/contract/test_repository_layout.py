from pathlib import Path


ROOT = Path(__file__).parents[2]


def test_public_resources_have_one_obvious_top_level_home() -> None:
    expected = {
        ".agents/skills",
        "agents/roles",
        "adapters",
        "data",
        "docs",
        "jobs",
        "scripts",
        "src",
        "tests",
    }

    assert all((ROOT / relative).is_dir() for relative in expected)
    assert not (ROOT / "src/mind_os_builder/assets").exists()


def test_canonical_resources_are_present_at_repository_root() -> None:
    assert (ROOT / ".agents/skills/mind-os/SKILL.md").is_file()
    assert (ROOT / "agents/orchestrator.md").is_file()
    assert (ROOT / "agents/roles/lumina.md").is_file()
    assert (ROOT / "jobs/lint.yaml").is_file()
    assert (ROOT / "data/core/AGENTS.md").is_file()
    assert (ROOT / "data/books/wiki/books/books.base").is_file()
