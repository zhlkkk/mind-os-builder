from __future__ import annotations

from dataclasses import dataclass

from mind_os_builder.core.config import Settings
from mind_os_builder.core.write_guard import WriteGuard


@dataclass(slots=True)
class RuntimeContext:
    settings: Settings

    @property
    def write_guard(self) -> WriteGuard:
        return WriteGuard(self.settings.vault_root)
