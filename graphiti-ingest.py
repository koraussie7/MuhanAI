"""
Graphiti ingest bridge for the MuhanAI cosmic world log.

Reads the append-only JSONL written by the AgentMesh world routes
(ShadowBroker observations x Pythia forecasts) and replays it into Graphiti,
which stores every fact with a *validity window*. That is what the append-only
log alone cannot answer: "was the Gulf jamming real in March, and is it still
true now".

Design notes
------------
- The cosmic log is the source of truth; Graphiti is a derived index, so a
  crash here never costs data. `group_id` is per-entity-class so a query can
  ask for observations only, or forecasts only.
- Episodes are keyed by the log event id, so re-running over the same log is
  idempotent (Graphiti upserts on uuid).
- Local Ollama serves the LLM, the embedder, and the reranker: the 110 box
  already runs it, and this keeps the geo pipeline independent of third-party
  quotas (the external gateway returns all_candidates_exhausted).
"""

import asyncio
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from graphiti_core import Graphiti
from graphiti_core.cross_encoder.client import CrossEncoderClient
from graphiti_core.driver.falkordb_driver import FalkorDriver
from graphiti_core.embedder.client import EmbedderClient
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient
from graphiti_core.nodes import EpisodeType

COSMOS_LOG = Path(os.environ.get("COSMOS_LOG_PATH", "/mnt/data/agentmesh-muhanai/cosmos.jsonl"))
FALKOR_HOST = os.environ.get("FALKORDB_HOST", "127.0.0.1")
FALKOR_PORT = int(os.environ.get("FALKORDB_PORT", "6380"))
FALKOR_PASSWORD = os.environ.get("FALKORDB_PASSWORD", "")
OLLAMA_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434/v1")
LLM_MODEL = os.environ.get("GRAPHITI_LLM_MODEL", "qwen2.5-coder:3b")
EMBED_MODEL = os.environ.get("GRAPHITI_EMBED_MODEL", "nomic-embed-text")
EMBED_DIM = int(os.environ.get("GRAPHITI_EMBED_DIM", "768"))
STATE_FILE = Path(os.environ.get("GRAPHITI_STATE", "/mnt/data/graphiti/ingest-state.json"))
BATCH = int(os.environ.get("GRAPHITI_BATCH", "25"))
HOURS = float(os.environ.get("GRAPHITI_WINDOW_HOURS", "0"))


class OllamaEmbedder(EmbedderClient):
    """Embedder backed by a local Ollama server (OpenAI-compatible /v1)."""

    def __init__(self, base_url: str, model: str, dim: int):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.dim = dim

    async def create(self, input_data: str | list[str]) -> list[list[float]]:
        return await self._embed([input_data] if isinstance(input_data, str) else list(input_data))

    async def create_batch(self, input_data_list: list[str]) -> list[list[float]]:
        return await self._embed(list(input_data_list))

    async def _embed(self, texts: list[str]) -> list[list[float]]:
        import httpx

        async with httpx.AsyncClient(timeout=180) as client:
            res = await client.post(
                f"{self.base_url}/embeddings",
                json={"model": self.model, "input": texts},
            )
            res.raise_for_status()
            data = res.json()["data"]
            data.sort(key=lambda item: item["index"])
            return [item["embedding"] for item in data]


class LexicalReranker(CrossEncoderClient):
    """Deterministic token-overlap reranker.

    Graphiti scores candidate facts for relevance before writing them. The
    local 3B model has no cross-encoder head and the external gateway is
    quota-exhausted, so this ranks by token overlap. Weaker than a learned
    reranker, but it keeps the pipeline fully offline.
    """

    async def rank(self, query: str, passages: list[str]):
        query_tokens = set(re.findall(r"[a-z0-9]+", query.lower()))

        def score(passage: str) -> float:
            passage_tokens = set(re.findall(r"[a-z0-9]+", passage.lower()))
            if not query_tokens:
                return 0.0
            return len(query_tokens & passage_tokens) / len(query_tokens)

        scored = [(score(passage), passage) for passage in passages]
        scored.sort(key=lambda item: item[0], reverse=True)
        return scored


def load_state() -> set[str]:
    if STATE_FILE.exists():
        try:
            return set(json.loads(STATE_FILE.read_text()))
        except (json.JSONDecodeError, OSError):
            return set()
    return set()


def save_state(done: set[str]) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(sorted(done)))


def read_events(log_path: Path, cutoff: float | None) -> list[dict]:
    if not log_path.exists():
        return []
    events = []
    for line in log_path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(event, dict):
            continue
        timestamp = event.get("timestamp")
        if cutoff is not None and isinstance(timestamp, (int, float)) and timestamp < cutoff:
            continue
        events.append(event)
    return events


def reference_time_for(event: dict) -> datetime:
    """Timezone-aware event time, falling back to now when the log has none."""
    timestamp = event.get("timestamp")
    if isinstance(timestamp, (int, float)):
        return datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc)
    return datetime.now(timezone.utc)


def _world_event_episode(event: dict, payload: dict, source: str, when: str) -> tuple[str, str, str, str]:
    title = str(payload.get("title", "untitled"))
    domain = payload.get("domain", "general")
    severity = payload.get("severity", "info")
    geo = payload.get("geo") or {}
    where = payload.get("location") or (
        f"{geo.get('lat')},{geo.get('lng')}" if geo else "unknown location"
    )
    body = (
        f"[{source}] {str(severity).upper()} {domain} observation at {where}: {title}. "
        f"Upstream id {payload.get('upstreamId', 'n/a')}, observed at {when}."
    )
    return title, body, f"cosmos-{source}", f"cosmos_{source}"


def _prediction_episode(event: dict, payload: dict, source: str, when: str) -> tuple[str, str, str, str]:
    title = str(payload.get("title", "untitled"))
    body = (
        f"[pythia] forecast ({payload.get('horizon', 'n/a')}): {title}. "
        f"probability {payload.get('probability')}, confidence {payload.get('confidence')}. "
        f"Rationale: {payload.get('rationale', '')}. Issued at {when}."
    )
    return title, body, "cosmos-pythia", "cosmos_pythia"


def _ontology_node_episode(
    event: dict, payload: dict, source: str, when: str
) -> tuple[str, str, str, str]:
    label = str(payload.get("label", "concept"))
    body = (
        f"Ontology concept '{label}' (domain {payload.get('domain')}) observed in the "
        f"cosmic log at {when}, status {payload.get('status')}."
    )
    return label, body, "cosmos-ontology", "cosmos_ontology"


def _generic_episode(event: dict, payload: dict, source: str, when: str) -> tuple[str, str, str, str]:
    kind = event.get("kind", "unknown")
    body = f"{kind} event from {source} at {when}: {json.dumps(payload)[:800]}"
    return kind, body, f"cosmos-{source}", f"cosmos_{source}"


EPISODE_BUILDERS = {
    "world_event": _world_event_episode,
    "prediction": _prediction_episode,
    "ontology_node": _ontology_node_episode,
}


def episode_for(event: dict) -> tuple[str, str, str, str]:
    """Map one cosmic event onto (name, body, source_description, group_id)."""
    kind = event.get("kind", "unknown")
    payload = event.get("payload", {}) or {}
    source = event.get("source", "system")
    when = reference_time_for(event).isoformat()

    builder = EPISODE_BUILDERS.get(kind, _generic_episode)
    return builder(event, payload, source, when)


async def main() -> None:
    state = load_state()
    cutoff = None
    if HOURS > 0:
        cutoff = datetime.now(timezone.utc).timestamp() * 1000 - HOURS * 3600 * 1000
    events = read_events(COSMOS_LOG, cutoff)
    pending = [event for event in events if event.get("id") and event["id"] not in state]

    print(
        f"cosmic events={len(events)} pending={len(pending)} already_ingested={len(state)}",
        flush=True,
    )
    if not pending:
        return

    graphiti = None
    inserted = 0
    try:
        driver = FalkorDriver(
            host=FALKOR_HOST,
            port=FALKOR_PORT,
            password=FALKOR_PASSWORD or None,
        )
        llm = OpenAIGenericClient(
            config=LLMConfig(
                api_key="ollama",
                base_url=OLLAMA_URL,
                model=LLM_MODEL,
                small_model=LLM_MODEL,
            )
        )
        embedder = OllamaEmbedder(OLLAMA_URL, EMBED_MODEL, EMBED_DIM)
        graphiti = Graphiti(
            graph_driver=driver,
            llm_client=llm,
            embedder=embedder,
            cross_encoder=LexicalReranker(),
        )
        await graphiti.build_indices_and_constraints()

        limit = min(len(pending), BATCH)
        for index, event in enumerate(pending[:BATCH], start=1):
            name, body, source_description, group = episode_for(event)
            reference_time = reference_time_for(event)
            try:
                await graphiti.add_episode(
                    name=name[:120],
                    episode_body=body,
                    source=EpisodeType.text,
                    source_description=source_description,
                    reference_time=reference_time,
                    group_id=group,
                    uuid=event["id"],
                )
                state.add(event["id"])
                inserted += 1
                print(f"[{index}/{limit}] {group} {name[:60]}", flush=True)
                save_state(state)
            except Exception as exc:  # noqa: BLE001 — one bad event must not stop the run
                print(f"[{index}] FAILED {name[:60]}: {type(exc).__name__}: {exc}", flush=True)
    finally:
        try:
            save_state(state)
        except OSError as exc:
            print(f"save_state failed: {type(exc).__name__}: {exc}", flush=True)
        if graphiti is not None:
            await graphiti.close()

    print(f"ingested={inserted} total_state={len(state)}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())