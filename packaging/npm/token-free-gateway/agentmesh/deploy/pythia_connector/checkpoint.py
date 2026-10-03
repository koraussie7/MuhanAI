"""Resume-after state management for the Pythia Connector.

Persists checkpoint state to disk so the connector can resume from
where it left off after a restart. State is JSON-serializable and
versioned for forward-compatibility.

File layout:
  deploy/pythia-connector/.checkpoint.json

This mirrors the pattern in packages/knowledge-base/src/p2p-memory/
replication.ts — incremental sync with idempotent dedup.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Optional

from .models import CheckpointState

logger = logging.getLogger("pythia_connector.checkpoint")

DEFAULT_CHECKPOINT_PATH = Path(
    os.environ.get(
        "PYTHIA_CHECKPOINT_PATH",
        str(Path(__file__).resolve().parent / ".checkpoint.json"),
    )
)

CHECKPOINT_VERSION = "1.0.0"


class CheckpointStore:
    """Atomic load/save of CheckpointState to a JSON file.

    Uses a write-to-temp-then-rename strategy to prevent corruption
    on concurrent writes or process kills.
    """

    def __init__(self, path: Optional[Path] = None) -> None:
        self.path = path or DEFAULT_CHECKPOINT_PATH
        self._state: Optional[CheckpointState] = None

    @property
    def state(self) -> CheckpointState:
        """Lazily load checkpoint state on first access."""
        if self._state is None:
            self._state = self.load()
        return self._state

    def load(self) -> CheckpointState:
        """Load checkpoint from disk; return fresh state if not found or corrupt."""
        if not self.path.exists():
            logger.info("No checkpoint file found at %s — starting fresh", self.path)
            return CheckpointState()

        try:
            with open(self.path, "r", encoding="utf-8") as f:
                raw = json.load(f)
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Checkpoint file corrupt (%s) — starting fresh: %s", self.path, exc)
            return CheckpointState()

        try:
            state = CheckpointState.model_validate(raw)
            logger.info(
                "Checkpoint loaded: last_event=%s, processed=%d, forecasts=%d",
                state.last_event_timestamp,
                len(state.processed_event_ids),
                len(state.seen_forecast_ids),
            )
            return state
        except Exception as exc:
            logger.warning("Checkpoint schema mismatch — starting fresh: %s", exc)
            return CheckpointState()

    def save(self, state: Optional[CheckpointState] = None) -> None:
        """Save checkpoint atomically (temp file + rename)."""
        state = state or self._state or self.state
        data = state.model_dump(mode="json")
        data["version"] = CHECKPOINT_VERSION

        # Atomic write: temp file in same directory, then rename
        dir_path = self.path.parent
        dir_path.mkdir(parents=True, exist_ok=True)

        fd, tmp_path = tempfile.mkstemp(
            dir=str(dir_path),
            prefix=".checkpoint_",
            suffix=".json.tmp",
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False, default=str)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp_path, self.path)
            logger.debug("Checkpoint saved to %s", self.path)
        except Exception:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            raise

    def update_event(self, event_id: str, timestamp: Optional[str] = None) -> None:
        """Record a processed event and advance the cursor."""
        state = self.state
        state.processed_event_ids.add(event_id)
        if len(state.processed_event_ids) > 100_000:
            state.processed_event_ids = set(list(state.processed_event_ids)[-50_000:])
        if timestamp:
            try:
                from datetime import datetime

                state.last_event_timestamp = datetime.fromisoformat(timestamp)
            except ValueError:
                pass
        state.last_event_id = event_id
        self._state = state

    def update_forecast(self, forecast_id: str) -> None:
        """Record a seen forecast."""
        state = self.state
        state.seen_forecast_ids.add(forecast_id)
        if len(state.seen_forecast_ids) > 50_000:
            state.seen_forecast_ids = set(list(state.seen_forecast_ids)[-25_000:])
        self._state = state

    def has_event(self, event_id: str) -> bool:
        """Check if an event ID has already been processed."""
        return event_id in self.state.processed_event_ids

    def has_forecast(self, forecast_id: str) -> bool:
        """Check if a forecast ID has already been seen."""
        return forecast_id in self.state.seen_forecast_ids

    def get_cursor(self) -> Optional[str]:
        """Return the last processed event timestamp for incremental polling."""
        ts = self.state.last_event_timestamp
        return ts.isoformat() if ts else None

    def reset(self) -> None:
        """Reset checkpoint state (force re-processing of all events)."""
        self._state = CheckpointState()
        self.save()
        logger.info("Checkpoint reset")

    def __enter__(self) -> "CheckpointStore":
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        if self._state is not None:
            self.save()

    def __repr__(self) -> str:
        return f"CheckpointStore(path={self.path})"
