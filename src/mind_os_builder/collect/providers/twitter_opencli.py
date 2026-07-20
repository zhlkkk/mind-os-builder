from __future__ import annotations

from mind_os_builder.collect.contracts import ProviderBatch, ProviderCapability
from mind_os_builder.collect.providers._subprocess import Runner, default_runner, run_json_command


class TwitterOpenCliProvider:
    name = "twitter-opencli"

    def __init__(
        self,
        *,
        command: tuple[str, ...] = ("opencli", "twitter", "timeline", "--json"),
        timeout: float = 30.0,
        runner: Runner = default_runner,
    ) -> None:
        self._command = command
        self._timeout = timeout
        self._runner = runner

    @property
    def capability(self) -> ProviderCapability:
        return ProviderCapability(source="twitter", network=True, experimental=True)

    def fetch(self, cursor: str | None = None) -> ProviderBatch:
        command = self._command + (("--cursor", cursor) if cursor else ())
        return run_json_command(
            command,
            timeout=self._timeout,
            runner=self._runner,
            record_keys=("records", "items", "data"),
        )
