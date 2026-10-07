"""Atomic checkpoint state for incremental polling and resume-after."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

from pythia_connector.models import CheckpointState


class CheckpointManager:
    """Manages atomic write/read of checkpoint state for resume-after polling.

    Uses a temp-file + rename pattern to ensure atomicity on POSIX systems.
    """

    def __init__(self, checkpoint_path: str | Path = "checkpoint.json"):
        self.path = Path(checkpoint_path)

    def load(self) -> CheckpointState:
        """Load checkpoint state from disk.

        Returns a default CheckpointState if the file does not exist.
        """
        if not self.path.exists():
            return CheckpointState()
        with open(self.path, "r") as f:
            data = json.load(f)
        return CheckpointState.model_validate(data)

    def save(self, state: CheckpointState) -> None:
        """Atomically save checkpoint state to disk."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp_fd, tmp_path = tempfile.mkstemp(
            dir=str(self.path.parent),
            prefix=f".{self.path.name}.",
            suffix=".tmp",
        )
        try:
            with os.fdopen(tmp_fd, "w") as f:
                json.dump(state.model_dump(mode="json"), f, indent=2, default=str)
                f.write("\n")
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp_path, self.path)
        except BaseException:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise

    def update(
        self,
        last_event_id: str | None = None,
        last_event_timestamp: str | None = None,
        processed_event_ids: set[str] | None = None,
        seen_forecast_ids: set[str] | None = None,
    ) -> CheckpointState:
        """Load, update fields, save, and return the new state."""
        state = self.load()
        if last_event_id is not None:
            state.last_event_id = last_event_id
        if last_event_timestamp is not None:
            from datetime import datetime, timezone

            state.last_event_timestamp = datetime.fromisoformat(
                last_event_timestamp.replace("Z", "+00:00")
            )
        if processed_event_ids is not None:
            state.processed_event_ids |= processed_event_ids
        if seen_forecast_ids is not None:
            state.seen_forecast_ids |= seen_forecast_ids
        self.save(state)
        return state

    def has_processed(self, event_id: str) -> bool:
        """Check if an event ID has already been processed."""
        state = self.load()
        return event_id in state.processed_event_ids

    def has_seen_forecast(self, forecast_id: str) -> bool:
        """Check if a forecast ID has already been seen."""
        state = self.load()
        return forecast_id in state.seen_forecast_ids

    def to_dict(self) -> dict[str, Any]:
        """Return the checkpoint state as a dictionary (for debugging)."""
        return self.load().model_dump(mode="json")
