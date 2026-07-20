from __future__ import annotations


def marker_for(trigger_id: str) -> str:
    return f"> <!-- mindos:distill:{trigger_id} -->"


def was_applied(content: str, trigger_id: str) -> bool:
    return marker_for(trigger_id) in content
