from __future__ import annotations

import re
from pathlib import Path

import yaml


SKILLS_ROOT = Path("src/mind_os_builder/assets/skills")
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
        assert isinstance(metadata["description"], str) and metadata["description"].strip()
        assert len(str(metadata["description"])) <= 1024
        assert isinstance(metadata["compatibility"], str)
        assert 0 < len(str(metadata["compatibility"])) <= 500
        assert "Python 3.11" in str(metadata["compatibility"])
        assert "mindos" in body

        lowered = body.lower()
        for forbidden in CLIENT_SPECIFIC_PATTERNS:
            assert forbidden.lower() not in lowered


def test_skill_relative_markdown_links_exist() -> None:
    link_pattern = re.compile(r"\[[^\]]+\]\((?!https?://|#)([^)]+)\)")
    for skill_file in SKILLS_ROOT.glob("*/SKILL.md"):
        _, body = _parse_skill(skill_file)
        for target in link_pattern.findall(body):
            resolved = (skill_file.parent / target).resolve()
            assert resolved.is_relative_to(skill_file.parent.resolve())
            assert resolved.exists(), f"{skill_file}: 缺少相对资源 {target}"
