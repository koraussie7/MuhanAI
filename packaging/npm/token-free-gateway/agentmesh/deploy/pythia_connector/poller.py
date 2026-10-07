"""Incremental polling for Pythia events with checkpoint-based resume."""

from __future__ import annotations

import logging
from typing import Any

from pythia_connector.checkpoint import CheckpointManager
from pythia_connector.dedupe import Deduper, content_hash
from pythia_connector.models import PythiaEvent, PythiaForecast
from pythia_connector.normalizer import normalize_event, normalize_forecast
from pythia_connector.client import PythiaClient

logger = logging.getLogger(__name__)


class EventPoller:
    """Polls the Pythia API incrementally, deduplicating and checkpointing results.

    Maintains a checkpoint of the last-seen event ID and a set of
    already-processed event IDs to avoid duplicates across restarts.
    """

    def __init__(
        self,
        client: PythiaClient,
        checkpoint: CheckpointManager | str | None = None,
        dedup_hashes: set[str] | None = None,
    ):
        self.client = client
        if isinstance(checkpoint, CheckpointManager):
            self.checkpoint = checkpoint
        elif checkpoint is None:
            self.checkpoint = CheckpointManager()
        else:
            self.checkpoint = CheckpointManager(checkpoint)
        self.deduper = Deduper(seen_hashes=dedup_hashes)

    def poll_once(
        self,
        limit: int = 100,
        agent_id: str | None = None,
        kind: str | None = None,
    ) -> list[PythiaEvent]:
        """Perform a single poll cycle.

        Fetches the latest events, deduplicates them, filters out already-
        processed events, and updates the checkpoint.

        Returns the list of new, non-duplicate events.
        """
        state = self.checkpoint.load()
        after = state.last_event_id

        raw_events = self.client.get_events(
            limit=limit,
            after=after,
            agent_id=agent_id,
            kind=kind,
        )

        new_events: list[PythiaEvent] = []
        processed_ids: set[str] = set()

        for event in raw_events:
            if self.deduper.is_duplicate(event.model_dump()):
                continue
            if event.event_id in state.processed_event_ids:
                continue
            self.deduper.add(event.model_dump())
            processed_ids.add(event.event_id)
            new_events.append(event)

        if new_events:
            self.checkpoint.update(
                last_event_id=new_events[-1].event_id,
                last_event_timestamp=new_events[-1].timestamp.isoformat(),
                processed_event_ids=processed_ids,
            )

        return new_events

    def poll_forever(
        self,
        interval: float = 5.0,
        limit: int = 100,
        agent_id: str | None = None,
        kind: str | None = None,
    ) -> None:
        """Continuously poll until interrupted (KeyboardInterrupt)."""
        import time

        logger.info("Starting continuous polling (interval=%.1fs)", interval)
        try:
            while True:
                new_events = self.poll_once(
                    limit=limit,
                    agent_id=agent_id,
                    kind=kind,
                )
                if new_events:
                    logger.info(
                        "Polled %d new events (last_event_id=%s)",
                        len(new_events),
                        new_events[-1].event_id,
                    )
                time.sleep(interval)
        except KeyboardInterrupt:
            logger.info("Polling stopped by user")

    def poll_forecasts(
        self,
        limit: int = 100,
        agent_id: str | None = None,
        resolved: bool | None = None,
    ) -> list[PythiaForecast]:
        """Poll for new forecasts, deduplicating and checkpointing."""
        state = self.checkpoint.load()
        after = state.last_event_id

        raw_forecasts = self.client.get_forecasts(
            limit=limit,
            agent_id=agent_id,
            resolved=resolved,
        )

        new_forecasts: list[PythiaForecast] = []
        seen_ids: set[str] = set()

        for forecast in raw_forecasts:
            if self.deduper.is_duplicate(forecast.model_dump()):
                continue
            if forecast.forecast_id in seen_ids:
                continue
            if forecast.forecast_id in state.seen_forecast_ids:
                continue
            self.deduper.add(forecast.model_dump())
            seen_ids.add(forecast.forecast_id)
            new_forecasts.append(forecast)

        if new_forecasts:
            self.checkpoint.update(
                seen_forecast_ids=seen_ids,
            )

        return new_forecasts

    @property
    def seen_hashes(self) -> set[str]:
        return self.deduper.hashes

    def merge_seen_forecasts(self, ids: set[str]) -> None:
        """Merge a set of already-seen forecast IDs into the checkpoint."""
        state = self.checkpoint.load()
        self.checkpoint.update(seen_forecast_ids=ids)
