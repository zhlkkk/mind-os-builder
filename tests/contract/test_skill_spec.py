from __future__ import annotations

import re
from pathlib import Path

import yaml


SKILLS_ROOT = Path(".agents/skills")
EXPECTED_SKILLS = {
    "mind-os",
    "wiki-ingest",
    "wiki-query",
    "distill",
    "tech-research",
    "radar-review",
}
CLIENT_SPECIFIC_PATTERNS = ("$ARGUMENTS", "Task(", "codex subagent", "claude code")


def _parse_skill(path: Path) -> tuple[dict[str, object], str]:
    content = path.read_text(encoding="utf-8")
    match = re.fullmatch(r"---\n(.*?)\n---\n(.*)", content, flags=re.DOTALL)
    assert match is not None, f"{path} 必须包含 YAML frontmatter"
    metadata = yaml.safe_load(match.group(1))
    assert isinstance(metadata, dict)
    return metadata, match.group(2)


def test_public_skills_follow_open_agent_skills_contract() -> None:
    assert {path.parent.name for path in SKILLS_ROOT.glob("*/SKILL.md")} == EXPECTED_SKILLS

    for skill_file in SKILLS_ROOT.glob("*/SKILL.md"):
        metadata, body = _parse_skill(skill_file)
        name = skill_file.parent.name
        assert metadata["name"] == name
        assert re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name)
        assert len(name) <= 64
        assert isinstance(metadata["description"], str)
        description = metadata["description"]
        assert description.strip()
        assert len(description) <= 1024
        assert "时使用" in description
        assert isinstance(metadata["compatibility"], str)
        assert 0 < len(str(metadata["compatibility"])) <= 500
        assert "Python 3.11" in str(metadata["compatibility"])
        assert "mindos" in body

        lowered = body.lower()
        for forbidden in CLIENT_SPECIFIC_PATTERNS:
            assert forbidden.lower() not in lowered

        steps = re.findall(r"^\d+\. .+$", body, flags=re.MULTILINE)
        assert steps, f"{skill_file} 必须包含可执行步骤"
        assert all("完成条件：" in step for step in steps), (
            f"{skill_file} 的每个步骤都必须包含完成条件"
        )


def test_skill_relative_markdown_links_exist() -> None:
    link_pattern = re.compile(r"\[[^\]]+\]\((?!https?://|#)([^)]+)\)")
    for skill_file in SKILLS_ROOT.glob("*/SKILL.md"):
        _, body = _parse_skill(skill_file)
        for target in link_pattern.findall(body):
            resolved = (skill_file.parent / target).resolve()
            assert resolved.is_relative_to(skill_file.parent.resolve())
            assert resolved.exists(), f"{skill_file}: 缺少相对资源 {target}"


def test_wiki_skills_delegate_reads_and_writes_to_shared_actions() -> None:
    ingest = (SKILLS_ROOT / "wiki-ingest/SKILL.md").read_text(encoding="utf-8")
    query = (SKILLS_ROOT / "wiki-query/SKILL.md").read_text(encoding="utf-8")

    assert "mindos wiki ingest" in ingest
    assert "mindos wiki query" in ingest
    assert "不得直接写 vault" in ingest
    assert "mindos wiki query" in query
    assert "mindos wiki ingest" in query


def test_skill_commands_match_the_public_cli_contract() -> None:
    distill = (SKILLS_ROOT / "distill/SKILL.md").read_text(encoding="utf-8")
    research = (SKILLS_ROOT / "tech-research/SKILL.md").read_text(encoding="utf-8")

    assert "mindos distill scan <vault-root> <source> --json" in distill
    assert "mindos distill apply <vault-root> <source> <responses.json> --json" in distill
    assert (
        'mindos research run <vault-root> "<topic>" --mode <mode> '
        "--providers <auto-or-list> --json"
    ) in research
    assert "--topic" not in research
