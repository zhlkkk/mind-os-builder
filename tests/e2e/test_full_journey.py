from __future__ import annotations

from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
from threading import Thread
from typing import Iterator
import venv


CALLOUTS = {
    "lumina": "> [!quote] 🌿 Lumina (10:20)\n> 我注意到这段感受值得被看见。",
    "prism": "> [!quote] 🌌 Prism (10:21)\n> **What if** 换一个框架观察？",
    "vector": "> [!quote] 🔨 Vector (10:22)\n> - [ ] 完成一个可验证动作。",
    "nexus": "> [!info] 🌐 Nexus (10:23)\n> 合成资料显示需要继续核查证据。",
    "ember": "> [!quote] 🔥 Ember (10:24)\n> 这段触动与全书主题形成连接。",
}


class _ResearchHandler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        self.rfile.read(length)
        body = json.dumps(
            {
                "content": "合成研究证据，仅用于离线验证。",
                "citations": ["https://example.invalid/research/evidence"],
            }
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        del format, args


@contextmanager
def _research_endpoint() -> Iterator[str]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), _ResearchHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/research"
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def _json(command: list[str], *, cwd: Path) -> dict[str, object]:
    completed = subprocess.run(command, cwd=cwd, check=False, capture_output=True, text=True)
    assert completed.returncode == 0, (
        f"命令失败：{' '.join(command[:3])}\nstdout={completed.stdout}\nstderr={completed.stderr}"
    )
    payload = json.loads(completed.stdout)
    assert isinstance(payload, dict)
    return payload


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

    with _research_endpoint() as endpoint:
        steps["research"] = str(
            _json(
                [
                    str(mindos), "research", "run", str(vault), "Agent 协议", "--mode",
                    "quick", "--endpoint", endpoint, "--apply", "--json",
                ],
                cwd=tmp_path,
            )["status"]
        )

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
