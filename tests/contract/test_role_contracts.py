from pathlib import Path
import tomllib

import yaml


ROOT = Path(__file__).parents[2]
AGENTS = ROOT / "src/mind_os_builder/assets/agents"
ROLES = ("lumina", "prism", "vector", "nexus", "ember")


def _frontmatter(path: Path) -> dict[str, object]:
    text = path.read_text(encoding="utf-8")
    _, raw, _ = text.split("---", 2)
    loaded = yaml.safe_load(raw)
    assert isinstance(loaded, dict)
    return loaded


def test_markdown_roles_are_canonical_and_codex_files_are_adapters() -> None:
    orchestrator = (AGENTS / "orchestrator.md").read_text(encoding="utf-8")
    assert "scan" in orchestrator and "apply" in orchestrator
    assert "不得直接写入" in orchestrator

    for role in ROLES:
        markdown = AGENTS / "roles" / f"{role}.md"
        contract = _frontmatter(markdown)
        assert contract["name"] == role
        assert contract["contract_version"] == "v1"
        assert contract["write_paths"] == []
        assert "只返回一个" in markdown.read_text(encoding="utf-8")

        adapter = tomllib.loads((AGENTS / "codex" / f"{role}.toml").read_text(encoding="utf-8"))
        assert adapter["name"] == role
        assert f"roles/{role}.md" in adapter["developer_instructions"]
        assert "不得直接写文件" in adapter["developer_instructions"]
