from __future__ import annotations

import json
from pathlib import Path

from mind_os_builder.core.locks import FileLock
from mind_os_builder.core.write_guard import WriteGuard


class CursorStore:
    _relative_path = Path(".mindos/collect/cursors.json")

    def __init__(self, vault_root: Path) -> None:
        self._root = vault_root
        self._guard = WriteGuard(vault_root)

    def _read(self) -> dict[str, str]:
        path = self._root / self._relative_path
        if not path.exists():
            return {}
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("cursor state must be a JSON object")
        return {str(key): str(value) for key, value in payload.items()}

    def get(self, provider_name: str) -> str | None:
        return self._read().get(provider_name)

    def commit(self, provider_name: str, cursor: str) -> None:
        lock_path = self._root / ".mindos/locks/collect-cursors.lock"
        with FileLock(lock_path):
            state = self._read()
            state[provider_name] = cursor
            content = json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
            self._guard.atomic_write(self._relative_path, content)
