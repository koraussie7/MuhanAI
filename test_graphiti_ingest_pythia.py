"""Tests for the Pythia (prediction) path in graphiti-ingest.py.

graphiti-ingest.py imports graphiti_core at module level, which is a heavy
optional dependency that is not installed everywhere. We stub those modules
in sys.modules before import so the pure formatting/dispatch logic can be
exercised in isolation.

Run: python3 test_graphiti_ingest_pythia.py
"""

import importlib.util
import sys
import types
from datetime import datetime, timezone
from pathlib import Path


def _install_graphiti_stubs() -> None:
    def module(name: str, **attrs: object) -> types.ModuleType:
        mod = types.ModuleType(name)
        for key, value in attrs.items():
            setattr(mod, key, value)
        sys.modules[name] = mod
        return mod

    class _Stub:
        def __init__(self, *args, **kwargs):
            pass

    module("graphiti_core", Graphiti=_Stub)
    module("graphiti_core.cross_encoder")
    module("graphiti_core.cross_encoder.client", CrossEncoderClient=_Stub)
    module("graphiti_core.driver")
    module("graphiti_core.driver.falkordb_driver", FalkorDriver=_Stub)
    module("graphiti_core.embedder")
    module("graphiti_core.embedder.client", EmbedderClient=_Stub)
    module("graphiti_core.llm_client")
    module("graphiti_core.llm_client.config", LLMConfig=_Stub)
    module("graphiti_core.llm_client.openai_generic_client", OpenAIGenericClient=_Stub)
    module("graphiti_core.nodes", EpisodeType=types.SimpleNamespace(text="text"))


def _load_ingest_module():
    """Load graphiti-ingest.py by path (the hyphen makes it unimportable by name)."""
    path = Path(__file__).resolve().parent / "graphiti-ingest.py"
    spec = importlib.util.spec_from_file_location("graphiti_ingest", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load ingest module from {path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["graphiti_ingest"] = mod
    spec.loader.exec_module(mod)
    return mod


_install_graphiti_stubs()
ingest = _load_ingest_module()


def test_prediction_dispatches_to_pythia_builder() -> None:
    event = {
        "id": "evt-pred-1",
        "kind": "prediction",
        "timestamp": 1_700_000_000_000,
        "payload": {
            "title": "Strait of Hormuz closure risk",
            "horizon": "72h",
            "probability": 0.42,
            "confidence": "medium",
            "rationale": "Naval build-up plus GPS jamming cluster",
        },
    }

    name, body, source_description, group = ingest.episode_for(event)

    assert name == "Strait of Hormuz closure risk", name
    assert source_description == "cosmos-pythia", source_description
    assert group == "cosmos_pythia", group
    assert "[pythia] forecast (72h)" in body, body
    assert "probability 0.42" in body, body
    assert "confidence medium" in body, body
    assert "Naval build-up" in body, body
    # reference_time_for must honor the millisecond timestamp, not now().
    expected = datetime.fromtimestamp(
        1_700_000_000_000 / 1000, tz=timezone.utc
    ).isoformat()
    assert expected in body, (expected, body)
    print("ok: prediction -> pythia builder")


def test_prediction_falls_back_when_payload_sparse() -> None:
    event = {"id": "evt-pred-2", "kind": "prediction", "payload": {}}

    name, body, source_description, group = ingest.episode_for(event)

    assert name == "untitled", name
    assert "forecast (n/a)" in body, body
    assert "probability None" in body, body
    assert source_description == "cosmos-pythia", source_description
    assert group == "cosmos_pythia", group
    print("ok: sparse prediction -> sane defaults")


def test_non_prediction_kinds_do_not_hit_pythia_branch() -> None:
    world = {
        "id": "evt-world-1",
        "kind": "world_event",
        "source": "shadowbroker",
        "payload": {"title": "Gulf jamming", "domain": "conflict", "severity": "high"},
    }
    name, body, source_description, group = ingest.episode_for(world)

    assert source_description == "cosmos-shadowbroker", source_description
    assert group == "cosmos_shadowbroker", group
    assert "[pythia]" not in body, body
    print("ok: world_event stays on its own builder")


def test_non_dict_json_lines_are_skipped() -> None:
    import json
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as tmp:
        log = Path(tmp) / "cosmos.jsonl"
        log.write_text(
            "\n".join(
                [
                    json.dumps([1, 2, 3]),          # array -> must be skipped
                    "5",                            # scalar -> must be skipped
                    "{not json",                    # malformed -> must be skipped
                    json.dumps({"id": "good", "kind": "prediction", "payload": {}}),
                ]
            )
        )
        events = ingest.read_events(log, None)

    assert len(events) == 1, events
    assert events[0]["id"] == "good", events
    print("ok: non-dict JSON lines skipped")


if __name__ == "__main__":
    test_prediction_dispatches_to_pythia_builder()
    test_prediction_falls_back_when_payload_sparse()
    test_non_prediction_kinds_do_not_hit_pythia_branch()
    test_non_dict_json_lines_are_skipped()
    print("\nall graphiti-ingest pythia tests passed")