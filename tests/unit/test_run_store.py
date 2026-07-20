import json
import stat

from mind_os_builder.core.results import RunEnvelope, RunStatus
from mind_os_builder.core.run_store import RunStore


def test_run_store_persists_only_whitelisted_summary(tmp_path) -> None:
    store = RunStore(tmp_path)
    result = RunEnvelope(
        task="research.run",
        status=RunStatus.SUCCEEDED,
        metrics={"providers": 2},
    )
    path = store.save(result, checkpoint={"stage": "collect", "raw_response": "secret"})
    payload = json.loads(path.read_text())
    assert payload["checkpoint"] == {"stage": "collect"}
    assert "raw_response" not in path.read_text()
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
