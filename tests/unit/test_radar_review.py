from datetime import date
from pathlib import Path

from mind_os_builder.radar.parser import RadarConfig, load_signals
from mind_os_builder.radar.review import apply_review, review_radar


def _page(signals: str, *, updated: str = "2026-01-01") -> str:
    return f"""---
domain: ai-and-llm
sources: 1
created: 2026-01-01
updated: {updated}
tags: [radar]
---
# Radar
{signals}
"""


def test_review_boundaries_compilation_and_cross_year(tmp_path: Path) -> None:
    radar = tmp_path / "wiki" / "radar" / "2025-12.md"
    radar.parent.mkdir(parents=True)
    radar.write_text(
        _page(
            """
### 🔴 观察
**十一天**
- 最新信号: 2025-12-21
- 来源: 12-21 简报

**十二天**
- 最新信号: 2025-12-20
- 来源: 12-20 简报

**十四天已编译**
- 最新信号: 2025-12-18
- 来源: 12-18 简报
- → 已编译: [[some-page]]

### 🟢 记录
**十四天未编译**
- 最新信号: 2025-12-18
- 来源: 12-18 简报
"""
        ),
        encoding="utf-8",
    )

    report = review_radar(load_signals(tmp_path, RadarConfig(pages=(Path("wiki/radar/2025-12.md"),))), today=date(2026, 1, 1))

    assert {item.title for item in report.active} == {"十一天"}
    assert {item.title for item in report.near} == {"十二天"}
    actions = {item.title: item.action for item in report.actions}
    assert actions["十四天已编译"] == "archive_compiled"
    assert actions["十四天未编译"] == "archive_faded"


def test_sources_are_deduplicated_and_yellow_signal_can_upgrade(tmp_path: Path) -> None:
    page = tmp_path / "wiki" / "radar" / "current.md"
    page.parent.mkdir(parents=True)
    page.write_text(
        _page(
            """
### 🟡 跟踪
**新协议**
- 最新信号: 2026-01-09
- 来源: 12-31/01-09/01-09 周报
"""
        ),
        encoding="utf-8",
    )

    signals = load_signals(tmp_path, RadarConfig(pages=(Path("wiki/radar/current.md"),)))
    report = review_radar(signals, today=date(2026, 1, 10))

    assert signals[0].source_dates == (date(2025, 12, 31), date(2026, 1, 9))
    assert [(item.title, item.action) for item in report.actions] == [("新协议", "promote_red")]


def test_hub_configuration_locates_split_monthly_pages(tmp_path: Path) -> None:
    radar_dir = tmp_path / "wiki" / "radar"
    radar_dir.mkdir(parents=True)
    (radar_dir / "index.md").write_text("# Radar\n- [[2026-01]]\n- [[2026-02]]\n", encoding="utf-8")
    (radar_dir / "2026-01.md").write_text(_page("### 🟢 记录\n**一月**\n- 最新信号: 2026-01-01\n"), encoding="utf-8")
    (radar_dir / "2026-02.md").write_text(_page("### 🟢 记录\n**二月**\n- 最新信号: 2026-02-01\n"), encoding="utf-8")

    signals = load_signals(tmp_path, RadarConfig(hub=Path("wiki/radar/index.md")))

    assert {signal.title for signal in signals} == {"一月", "二月"}


def test_dry_run_is_zero_write_and_apply_is_idempotent(tmp_path: Path) -> None:
    page = tmp_path / "wiki" / "radar.md"
    page.parent.mkdir(parents=True)
    page.write_text(_page("### 🟡 跟踪\n**旧信号**\n- 最新信号: 2026-01-01\n"), encoding="utf-8")
    config = RadarConfig(pages=(Path("wiki/radar.md"),))
    before = page.read_bytes()

    report = review_radar(load_signals(tmp_path, config), today=date(2026, 1, 15))

    assert page.read_bytes() == before
    assert not (tmp_path / "wiki" / "log.md").exists()

    first = apply_review(tmp_path, report, today=date(2026, 1, 15))
    after_first = page.read_bytes()
    log_first = (tmp_path / "wiki" / "log.md").read_bytes()
    second = apply_review(tmp_path, report, today=date(2026, 1, 15))

    assert first.changed is True
    assert second.changed is False
    assert page.read_bytes() == after_first
    assert (tmp_path / "wiki" / "log.md").read_bytes() == log_first
    assert page.read_text(encoding="utf-8").count("⬇️ 2026-01-15") == 1
