from __future__ import annotations

import json
import os
from pathlib import Path

from mind_os_builder.core.results import RunEnvelope


CHECKPOINT_FIELDS = {
    "stage",
    "completed_steps",
    "artifact_ids",
    "resumed_from",
    "provider_versions",
    "input_hashes",
}


class RunStore:
    def __init__(self, vault_root: Path) -> None:
        self.root = vault_root / ".mindos" / "runs"

    def save(self, result: RunEnvelope, checkpoint: dict[str, object] | None = None) -> Path:
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.root, 0o700)
        safe_checkpoint = {
            key: value for key, value in (checkpoint or {}).items() if key in CHECKPOINT_FIELDS
        }
        payload = result.to_dict()
        payload["checkpoint"] = safe_checkpoint
        path = self.root / f"{result.run_id}.json"
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.chmod(path, 0o600)
        return path
