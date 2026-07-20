import json
from pathlib import Path
import shutil
import subprocess
import sys

import pytest

import scripts.install_harness as installer
from scripts.install_harness import install_skills, resolve_destination


ROOT = Path(__file__).parents[2]
SCRIPT = ROOT / "scripts/install_harness.py"


def _run_cli(*arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *arguments, "--json"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )


def test_project_destinations_follow_each_harness_native_layout(tmp_path: Path) -> None:
    assert resolve_destination("codex", "project", tmp_path, tmp_path / "home") == (
        tmp_path / ".agents/skills"
    )
    assert resolve_destination("claude-code", "project", tmp_path, tmp_path / "home") == (
        tmp_path / ".claude/skills"
    )
    assert resolve_destination("pi", "project", tmp_path, tmp_path / "home") == (
        tmp_path / ".pi/skills"
    )
    assert resolve_destination("openclaw", "project", tmp_path, tmp_path / "home") == (
        tmp_path / "skills"
    )
    assert resolve_destination("workbuddy", "project", tmp_path, tmp_path / "home") == (
        tmp_path / ".agents/skills"
    )


def test_hermes_requires_user_scope(tmp_path: Path) -> None:
    try:
        resolve_destination("hermes", "project", tmp_path, tmp_path / "home")
    except ValueError as exc:
        assert "user" in str(exc)
    else:
        raise AssertionError("Hermes 项目级安装必须被拒绝")

    assert resolve_destination("hermes", "user", tmp_path, tmp_path / "home") == (
        tmp_path / "home/.hermes/skills"
    )


def test_user_destinations_follow_each_harness_native_layout(tmp_path: Path) -> None:
    home = tmp_path / "home"
    expected = {
        "codex": home / ".agents/skills",
        "claude-code": home / ".claude/skills",
        "pi": home / ".pi/agent/skills",
        "hermes": home / ".hermes/skills",
        "openclaw": home / ".openclaw/skills",
        "workbuddy": home / ".workbuddy/skills",
    }

    assert {
        harness: resolve_destination(harness, "user", tmp_path, home)
        for harness in expected
    } == expected


def test_dry_run_then_apply_and_repeat_are_safe(tmp_path: Path) -> None:
    project = tmp_path / "consumer"
    project.mkdir()

    planned = install_skills(ROOT, "claude-code", "project", project, tmp_path / "home")
    assert planned["status"] == "planned"
    assert len(planned["install"]) == 6
    assert not (project / ".claude/skills").exists()

    applied = install_skills(
        ROOT,
        "claude-code",
        "project",
        project,
        tmp_path / "home",
        apply=True,
    )
    assert applied["status"] == "succeeded"
    assert (project / ".claude/skills/distill/SKILL.md").is_file()

    repeated = install_skills(
        ROOT,
        "claude-code",
        "project",
        project,
        tmp_path / "home",
        apply=True,
    )
    assert repeated["status"] == "succeeded"
    assert repeated["install"] == []
    assert len(repeated["unchanged"]) == 6

    installed_roles = project / ".claude/skills/distill/references/roles"
    canonical_roles = ROOT / "agents/roles"
    assert {
        path.name: path.read_text(encoding="utf-8") for path in installed_roles.glob("*.md")
    } == {
        path.name: path.read_text(encoding="utf-8") for path in canonical_roles.glob("*.md")
    }


def test_conflict_blocks_without_overwriting_existing_skill(tmp_path: Path) -> None:
    project = tmp_path / "consumer"
    existing = project / ".pi/skills/distill"
    existing.mkdir(parents=True)
    skill_file = existing / "SKILL.md"
    skill_file.write_text("用户自己的 Skill\n", encoding="utf-8")

    report = install_skills(
        ROOT,
        "pi",
        "project",
        project,
        tmp_path / "home",
        apply=True,
    )

    assert report["status"] == "blocked"
    assert report["conflicts"] == ["distill"]
    assert skill_file.read_text(encoding="utf-8") == "用户自己的 Skill\n"
    assert not (project / ".pi/skills/mind-os").exists()


def test_extra_empty_directory_is_detected_as_a_conflict(tmp_path: Path) -> None:
    project = tmp_path / "consumer"
    project.mkdir()
    installed = install_skills(
        ROOT, "claude-code", "project", project, tmp_path / "home", apply=True
    )
    assert installed["status"] == "succeeded"
    (project / ".claude/skills/mind-os/extra-empty-directory").mkdir()

    report = install_skills(
        ROOT, "claude-code", "project", project, tmp_path / "home", apply=True
    )

    assert report["status"] == "blocked"
    assert report["conflicts"] == ["mind-os"]


def test_copy_failure_leaves_no_final_partial_skill_and_retry_succeeds(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = tmp_path / "consumer"
    project.mkdir()
    destination = project / ".claude/skills"
    original_copytree = shutil.copytree
    failed = False

    def fail_once(source: Path, target: Path, *args: object, **kwargs: object) -> Path:
        nonlocal failed
        result = original_copytree(source, target, *args, **kwargs)
        if not failed and Path(source).name == "mind-os" and Path(target).parent == destination:
            failed = True
            raise OSError("synthetic interrupted copy")
        return result

    monkeypatch.setattr(installer.shutil, "copytree", fail_once)

    interrupted = install_skills(
        ROOT, "claude-code", "project", project, tmp_path / "home", apply=True
    )

    assert interrupted["status"] == "blocked"
    assert interrupted["applied"] is True
    assert (destination / "distill/SKILL.md").is_file()
    assert not (destination / "mind-os").exists()
    assert not list(destination.glob(".mindos-mind-os-*"))

    retried = install_skills(
        ROOT, "claude-code", "project", project, tmp_path / "home", apply=True
    )
    repeated = install_skills(
        ROOT, "claude-code", "project", project, tmp_path / "home", apply=True
    )

    assert retried["status"] == "succeeded"
    assert repeated["install"] == []
    assert len(repeated["unchanged"]) == 6


def test_concurrent_target_creation_is_blocked_without_overwrite(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = tmp_path / "consumer"
    project.mkdir()
    destination = project / ".claude/skills"
    original_rename = installer.os.rename
    raced = False

    def create_target_before_rename(source: Path, target: Path) -> None:
        nonlocal raced
        if not raced and Path(target).name == "distill":
            raced = True
            Path(target).mkdir()
            (Path(target) / "SKILL.md").write_text("并发安装内容\n", encoding="utf-8")
        original_rename(source, target)

    monkeypatch.setattr(installer.os, "rename", create_target_before_rename)

    report = install_skills(
        ROOT, "claude-code", "project", project, tmp_path / "home", apply=True
    )

    assert report["status"] == "blocked"
    assert (destination / "distill/SKILL.md").read_text(encoding="utf-8") == "并发安装内容\n"
    assert not list(destination.glob(".mindos-distill-*"))


def test_project_scope_blocks_symlinked_host_path_without_external_writes(
    tmp_path: Path,
) -> None:
    project = tmp_path / "consumer"
    outside = tmp_path / "outside"
    project.mkdir()
    outside.mkdir()
    (project / ".agents").symlink_to(outside, target_is_directory=True)

    for apply in (False, True):
        report = install_skills(
            ROOT,
            "codex",
            "project",
            project,
            tmp_path / "home",
            apply=apply,
        )
        assert report["status"] == "blocked"

    assert list(outside.iterdir()) == []


def test_user_scope_allows_an_explicit_symlinked_host_directory(tmp_path: Path) -> None:
    home = tmp_path / "home"
    configured = tmp_path / "configured-user-agent-home"
    home.mkdir()
    configured.mkdir()
    (home / ".agents").symlink_to(configured, target_is_directory=True)

    report = install_skills(
        ROOT,
        "codex",
        "user",
        tmp_path / "unused-project",
        home,
        apply=True,
    )

    assert report["status"] == "succeeded"
    assert (configured / "skills/distill/references/roles/lumina.md").is_file()


def test_source_skill_symlink_is_rejected(tmp_path: Path) -> None:
    repository = tmp_path / "repository"
    skill = repository / ".agents/skills/demo"
    skill.mkdir(parents=True)
    outside = tmp_path / "outside-skill.md"
    outside.write_text("外部内容\n", encoding="utf-8")
    (skill / "SKILL.md").symlink_to(outside)

    report = install_skills(
        repository,
        "codex",
        "project",
        tmp_path / "consumer",
        tmp_path / "home",
        apply=True,
    )

    assert report["status"] == "blocked"
    assert "符号链接" in report["message"]
    assert not (tmp_path / "consumer/.agents/skills/demo").exists()


def test_public_cli_defaults_to_preview_then_applies(tmp_path: Path) -> None:
    project = tmp_path / "consumer"
    project.mkdir()

    preview = _run_cli("claude-code", "--project", str(project))
    applied = _run_cli("claude-code", "--project", str(project), "--apply")

    assert preview.returncode == 0
    assert json.loads(preview.stdout)["status"] == "planned"
    assert applied.returncode == 0
    assert json.loads(applied.stdout)["status"] == "succeeded"
    assert (project / ".claude/skills/distill/references/roles/lumina.md").is_file()


def test_public_cli_returns_blocked_json_for_conflict(tmp_path: Path) -> None:
    project = tmp_path / "consumer"
    existing = project / ".pi/skills/distill"
    existing.mkdir(parents=True)
    (existing / "SKILL.md").write_text("用户自己的 Skill\n", encoding="utf-8")

    completed = _run_cli("pi", "--project", str(project), "--apply")
    payload = json.loads(completed.stdout)

    assert completed.returncode == 2
    assert payload["status"] == "blocked"
    assert payload["conflicts"] == ["distill"]


def test_public_cli_returns_blocked_json_for_hermes_project_scope(tmp_path: Path) -> None:
    completed = _run_cli("hermes", "--project", str(tmp_path))

    assert completed.returncode == 2
    assert json.loads(completed.stdout)["status"] == "blocked"


def test_public_cli_returns_blocked_json_for_filesystem_error(tmp_path: Path) -> None:
    project_file = tmp_path / "not-a-project-directory"
    project_file.write_text("file", encoding="utf-8")

    completed = _run_cli(
        "claude-code",
        "--project",
        str(project_file),
        "--apply",
    )

    assert completed.returncode == 2
    assert json.loads(completed.stdout)["status"] == "blocked"
    assert "Traceback" not in completed.stderr
