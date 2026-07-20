from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True, slots=True)
class ActionSpec:
    name: str
    effects: tuple[str, ...]
    description: str
    default_mode: str = "dry-run"


ACTION_REGISTRY: dict[str, ActionSpec] = {
    item.name: item
    for item in (
        ActionSpec("doctor", ("read",), "Inspect required and optional capabilities."),
        ActionSpec("wiki.init", ("workspace_write",), "Initialize a minimal LLM Wiki."),
        ActionSpec("wiki.lint", ("read",), "Check Wiki structure and links."),
        ActionSpec("wiki.ingest", ("workspace_write",), "Commit a compiled Wiki page."),
        ActionSpec("wiki.query", ("read",), "Search compiled Wiki pages."),
        ActionSpec("collect.twitter", ("network", "workspace_write"), "Collect Twitter signals."),
        ActionSpec("collect.rss", ("network", "workspace_write"), "Collect RSS/Atom signals."),
        ActionSpec("books.init", ("workspace_write",), "Install the RIA Book Base module."),
        ActionSpec("books.validate", ("read",), "Validate book pages and Base filters."),
        ActionSpec("distill.scan", ("read",), "Find tagged living-thread paragraphs."),
        ActionSpec("distill.apply", ("workspace_write",), "Apply validated role callouts."),
        ActionSpec("research.run", ("network", "paid_call", "workspace_write"), "Run tech research."),
        ActionSpec("radar.review", ("read", "workspace_write"), "Review Tech Radar signals."),
        ActionSpec(
            "job.run",
            ("network", "paid_call", "workspace_write"),
            "Dispatch a declared Job to an Action.",
        ),
    )
}


def capability_manifest() -> dict[str, object]:
    actions = []
    for name in sorted(ACTION_REGISTRY):
        payload = asdict(ACTION_REGISTRY[name])
        payload["effects"] = list(payload["effects"])
        actions.append(payload)
    return {"api_version": "v1", "actions": actions}
