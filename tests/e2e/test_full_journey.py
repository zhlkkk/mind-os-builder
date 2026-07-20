from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import venv


CALLOUTS = {
    "lumina": "> [!quote] 🌿 Lumina (10:20)\n> 我注意到这段感受值得被看见。",
    "prism": "> [!quote] 🌌 Prism (10:21)\n> **What if** 换一个框架观察？",
    "vector": "> [!quote] 🔨 Vector (10:22)\n> - [ ] 完成一个可验证动作。",
    "nexus": "> [!info] 🌐 Nexus (10:23)\n> 合成资料显示需要继续核查证据。",
    "ember": "> [!quote] 🔥 Ember (10:24)\n> 这段触动与全书主题形成连接。",
}

RESOURCE_TREES = {
    "skills": Path(".agents/skills"),
    "agents": Path("agents"),
    "adapters": Path("adapters"),
    "jobs": Path("jobs"),
    "data": Path("data"),
}


def _json(command: list[str], *, cwd: Path) -> dict[str, object]:
    completed = subprocess.run(command, cwd=cwd, check=False, capture_output=True, text=True)
    assert completed.returncode == 0, (
        f"命令失败：{' '.join(command[:3])}\nstdout={completed.stdout}\nstderr={completed.stderr}"
    )
    payload = json.loads(completed.stdout)
    assert isinstance(payload, dict)
    return payload


def _resource_manifest(root: Path) -> dict[str, str]:
    return {
        path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(candidate for candidate in root.rglob("*") if candidate.is_file())
    }


def test_wheel_install_runs_the_complete_offline_journey(tmp_path: Path) -> None:
    repository = Path(__file__).resolve().parents[2]
    distribution = tmp_path / "dist"
    subprocess.run(
        ["uv", "build", "--wheel", "--out-dir", str(distribution)],
        cwd=repository,
        check=True,
        capture_output=True,
        text=True,
    )
    wheel = next(distribution.glob("*.whl"))

    environment = tmp_path / "venv"
    venv.EnvBuilder(with_pip=True, system_site_packages=True).create(environment)
    binary = "Scripts/mindos.exe" if os.name == "nt" else "bin/mindos"
    mindos = environment / binary
    python = environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    subprocess.run(
        [str(python), "-m", "pip", "install", "--no-deps", str(wheel)],
        check=True,
        capture_output=True,
        text=True,
    )
    resource_probe = subprocess.run(
        [
            str(python),
            "-c",
            (
                "import hashlib, json\n"
                "from mind_os_builder.core.resources import resource_files, resource_tree\n"
                f"names = {tuple(RESOURCE_TREES)!r}\n"
                "manifest = {\n"
                "    name: {\n"
                "        relative.as_posix(): hashlib.sha256(resource.read_bytes()).hexdigest()\n"
                "        for relative, resource in resource_files(resource_tree(name))\n"
                "    }\n"
                "    for name in names\n"
                "}\n"
                "print(json.dumps(manifest, sort_keys=True))\n"
            ),
        ],
        cwd=tmp_path,
        check=False,
        capture_output=True,
        text=True,
    )
    assert resource_probe.returncode == 0, resource_probe.stderr
    installed_manifest = json.loads(resource_probe.stdout)
    expected_manifest = {
        name: _resource_manifest(repository / relative)
        for name, relative in RESOURCE_TREES.items()
    }
    assert installed_manifest == expected_manifest

    vault = tmp_path / "synthetic-vault"
    steps: dict[str, str] = {}
    steps["wiki"] = str(_json([str(mindos), "wiki", "init", str(vault), "--apply", "--json"], cwd=tmp_path)["status"])
    steps["lint"] = str(_json([str(mindos), "wiki", "lint", str(vault), "--json"], cwd=tmp_path)["status"])
    steps["job"] = str(_json([str(mindos), "job", "run", "lint", str(vault), "--json"], cwd=tmp_path)["status"])

    twitter_fixture = repository / "examples/synthetic-vault/fixtures/twitter.json"
    steps["twitter"] = str(
        _json(
            [
                str(mindos), "collect", "twitter", str(vault), "--fixture", str(twitter_fixture),
                "--output", "raw/collect/twitter-brief.md", "--apply", "--json",
            ],
            cwd=tmp_path,
        )["status"]
    )
    rss_fixture = repository / "examples/synthetic-vault/fixtures/rss.xml"
    steps["rss"] = str(
        _json(
            [
                str(mindos), "collect", "rss", str(vault), "--feed", rss_fixture.as_uri(),
                "--output", "raw/collect/rss-brief.md", "--apply", "--json",
            ],
            cwd=tmp_path,
        )["status"]
    )
    steps["books"] = str(_json([str(mindos), "books", "init", str(vault), "--apply", "--json"], cwd=tmp_path)["status"])
    assert _json([str(mindos), "books", "validate", str(vault), "--json"], cwd=tmp_path)["status"] == "succeeded"

    journal = vault / "journals/2026-07-20.md"
    journal.write_text(
        (repository / "examples/synthetic-vault/journals/demo.md").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    scan = _json(
        [str(mindos), "distill", "scan", str(vault), "journals/2026-07-20.md", "--json"],
        cwd=tmp_path,
    )
    triggers = scan["metrics"]["triggers"]
    responses = [
        {
            "trigger_id": trigger["trigger_id"],
            "persona": trigger["persona"],
            "callout": CALLOUTS[trigger["persona"]],
        }
        for trigger in triggers
    ]
    responses_path = tmp_path / "responses.json"
    responses_path.write_text(
        json.dumps(
            {"baseline_hash": scan["metrics"]["baseline_hash"], "responses": responses},
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    steps["distill"] = str(
        _json(
            [
                str(mindos), "distill", "apply", str(vault), "journals/2026-07-20.md",
                str(responses_path), "--apply", "--json",
            ],
            cwd=tmp_path,
        )["status"]
    )

    research_probe = subprocess.run(
        [
            str(python),
            "-c",
            (
                "import json, sys\n"
                "from pathlib import Path\n"
                "from mind_os_builder.research.models import "
                "ProviderResult, ProviderStatus, ResearchMode, ResearchRequest\n"
                "from mind_os_builder.research.runner import ResearchRunner\n"
                "class OfflineProvider:\n"
                "    name = 'tavily-search'\n"
                "    def run(self, request):\n"
                "        return ProviderResult(self.name, ProviderStatus.SUCCEEDED, "
                "'合成研究证据，仅用于离线验证。', "
                "citations=['https://example.invalid/research/evidence'])\n"
                "result = ResearchRunner([OfflineProvider()]).run(\n"
                "    ResearchRequest('Agent 协议', ResearchMode.QUICK),\n"
                "    vault_root=Path(sys.argv[1]), apply=True)\n"
                "print(json.dumps(result.to_dict(), ensure_ascii=False))\n"
            ),
            str(vault),
        ],
        cwd=tmp_path,
        check=False,
        capture_output=True,
        text=True,
    )
    assert research_probe.returncode == 0, research_probe.stderr
    steps["research"] = str(json.loads(research_probe.stdout)["status"])

    radar = vault / "wiki/concepts/synthetic-radar.md"
    radar.write_text(
        (repository / "examples/synthetic-vault/wiki/concepts/radar-demo.md").read_text(
            encoding="utf-8"
        ),
        encoding="utf-8",
    )
    index = vault / "wiki/index.md"
    index.write_text(
        index.read_text(encoding="utf-8").rstrip()
        + "\n- [[synthetic-radar]] — 合成技术雷达\n",
        encoding="utf-8",
    )
    log = vault / "wiki/log.md"
    log.write_text(
        log.read_text(encoding="utf-8").rstrip()
        + "\n- [e2e] 新增 [[synthetic-radar]] 合成页面\n",
        encoding="utf-8",
    )
    steps["radar"] = str(
        _json(
            [
                str(mindos), "radar", "review", str(vault), "--page",
                "wiki/concepts/synthetic-radar.md", "--today", "2026-07-20", "--json",
            ],
            cwd=tmp_path,
        )["status"]
    )
    assert _json([str(mindos), "wiki", "lint", str(vault), "--json"], cwd=tmp_path)[
        "status"
    ] == "succeeded"

    assert steps == {
        "wiki": "succeeded",
        "lint": "succeeded",
        "job": "succeeded",
        "twitter": "succeeded",
        "rss": "succeeded",
        "books": "succeeded",
        "distill": "succeeded",
        "research": "succeeded",
        "radar": "succeeded",
    }
    assert _json([str(mindos), "job", "list", "--json"], cwd=tmp_path)["jobs"] == [
        "collect-rss", "collect-twitter", "distill", "lint", "tech-radar", "tech-research"
    ]
    assert (vault / "raw/collect/twitter-brief.md").is_file()
    assert (vault / "raw/collect/rss-brief.md").is_file()
    assert (vault / "wiki/books/books.base").is_file()
    assert list((vault / "raw/research").glob("*.md"))
    content = journal.read_text(encoding="utf-8")
    assert all(name in content for name in ("Lumina", "Prism", "Vector", "Nexus", "Ember"))
