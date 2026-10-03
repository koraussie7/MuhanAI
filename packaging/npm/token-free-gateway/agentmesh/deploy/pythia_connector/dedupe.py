"""Cross-agent deduplication via content hashing.

In the P2PCLAW 14-agent collective, the same event or forecast may be
received from multiple peers via the Gun.js mesh. This module provides
deterministic content-hashing to detect duplicates:

  - hash_event(event_dict)  → content hash
  - hash_forecast(forecast_dict) → content hash
  - EventDeduplicator: in-memory + checkpoint-backed dedup store

The hash is based on the normalized semantic content (title, body, timestamp,
agent_id) — NOT on Pythia's internal IDs, which may differ across peers
due to local UUID generation.

Bridges to:
  - packages/knowledge-base/src/p2p-memory/replication.ts (content hash pattern)
  - packages/knowledge-base/src/visuals/colibri-metrics.ts (cache-hit-rate metric)
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime
from typing import Any, Optional

from .checkpoint import CheckpointStore

logger = logging.getLogger("pythia_connector.dedupe")


def _canonical_json(obj: Any) -> str:
    """Serialize to canonical JSON (sorted keys, stable datetime format)."""
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, default=_default_encoder)


def _default_encoder(obj: Any) -> str:
    """JSON encoder for types not natively serializable."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, bytes):
        return obj.hex()
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def _strip_volatile(text: str) -> str:
    """Remove fields that may differ across peers but don't affect semantic content.

    Strips:
      - Whitespace variations
      - Timestamp format differences (Z suffix vs +00:00)
    """
    text = text.strip()
    # Normalize whitespace
    text = re.sub(r"\s+", " ", text)
    # Normalize timestamps
    text = re.sub(r"\+00:00$", "Z", text)
    text = text.replace("T", " ").replace("Z", "")
    return text


def hash_event(event: dict[str, Any]) -> str:
    """Compute a deterministic content hash for a PythiaEvent dict.

    Uses semantic fields only: kind, title, body, source_agent, timestamp.
    This ensures the same logical event gets the same hash regardless of
    which P2PCLAW agent originally produced it.
    """
    raw = {
        "kind": event.get("kind", event.get("type", "")),
        "title": event.get("title", ""),
        "body": event.get("body", event.get("message", event.get("msg", ""))),
        "source_agent": event.get("source_agent", event.get("agent", "")),
        "timestamp": str(event.get("timestamp", event.get("ts", ""))),
    }
    canonical = _strip_volatile(_canonical_json(raw))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


def hash_forecast(forecast: dict[str, Any]) -> str:
    """Compute a deterministic content hash for a PythiaForecast dict.

    Uses semantic fields: hypothesis, outcome, confidence, agent_id.
    """
    raw = {
        "hypothesis": forecast.get("hypothesis", ""),
        "outcome": forecast.get("outcome", forecast.get("prediction", "")),
        "confidence": str(forecast.get("confidence", "")),
        "agent_id": forecast.get("agent_id", forecast.get("agent", "")),
    }
    canonical = _strip_volatile(_canonical_json(raw))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


class EventDeduplicator:
    """Deduplicator that tracks seen content hashes in-memory and in checkpoint.

    Provides O(1) duplicate detection while maintaining bounded memory
    via the CheckpointStore's rolling sets.
    """

    def __init__(self, checkpoint: Optional[CheckpointStore] = None) -> None:
        self._seen_hashes: set[str] = set()
        self._checkpoint = checkpoint or CheckpointStore()

    def is_duplicate_event(self, event: dict[str, Any]) -> bool:
        """Check if an event has already been seen (by content hash)."""
        h = hash_event(event)
        if h in self._seen_hashes or self._checkpoint.has_event(h):
            return True
        return False

    def is_duplicate_forecast(self, forecast: dict[str, Any]) -> bool:
        """Check if a forecast has already been seen (by content hash)."""
        h = hash_forecast(forecast)
        if h in self._seen_hashes or self._checkpoint.has_forecast(h):
            return True
        return False

    def record_event(self, event: dict[str, Any], event_id: Optional[str] = None) -> str:
        """Record an event as seen and return its content hash."""
        h = hash_event(event)
        self._seen_hashes.add(h)
        if event_id:
            self._checkpoint.update_event(event_id)
        return h

    def record_forecast(self, forecast: dict[str, Any], forecast_id: Optional[str] = None) -> str:
        """Record a forecast as seen and return its content hash."""
        h = hash_forecast(forecast)
        self._seen_hashes.add(h)
        if forecast_id:
            self._checkpoint.update_forecast(forecast_id)
        return h

    def stats(self) -> dict[str, int]:
        """Return dedup statistics for metrics reporting."""
        return {
            "seen_hashes_memory": len(self._seen_hashes),
            "seen_events_checkpoint": len(self._checkpoint.state.processed_event_ids),
            "seen_forecasts_checkpoint": len(self._checkpoint.state.seen_forecast_ids),
        }

    def clear_memory(self) -> None:
        """Clear in-memory cache (checkpoint persistence retained)."""
        self._seen_hashes.clear()
        logger.info("Deduplicator memory cache cleared")
