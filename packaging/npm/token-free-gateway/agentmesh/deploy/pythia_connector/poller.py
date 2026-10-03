"""Scheduled incremental polling of Pythia events and forecasts.

The poller is the primary ingestion mechanism for the connector when
webhooks are unavailable. It runs a loop that:

  1. Loads the last checkpoint cursor (resume-after timestamp).
  2. Fetches events/forecasts since the cursor from the Pythia API.
  3. Normalizes and deduplicates each item.
  4. Emits items to the next pipeline stage (P2P network / LocalCrab adapter).
  5. Saves the checkpoint.

Designed to run as a standalone script:

    python -m pythia_connector.poller --interval 60

Or as a library:

    poller = PythiaPoller(client, on_event=my_handler)
    poller.run_once()
"""

from __future__ import annotations

import logging
import os
import signal
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Optional

from .checkpoint import CheckpointStore
from .client import PythiaClient
from .dedupe import EventDeduplicator, hash_event, hash_forecast
from .models import PythiaEvent, PythiaForecast
from .normalizer import normalize_event, normalize_forecast
from .retry import retry, RetryableError

logger = logging.getLogger("pythia_connector.poller")

POLL_INTERVAL = int(os.environ.get("PYTHIA_POLL_INTERVAL", "60"))
POLL_LIMIT = int(os.environ.get("PYTHIA_POLL_LIMIT", "100"))
MAX_FORECASTS_PER_POLL = int(os.environ.get("PYTHIA_POLL_MAX_FORECASTS", "50"))


# Type alias for event handlers
EventHandler = Callable[[PythiaEvent], Any]
ForecastHandler = Callable[[PythiaForecast], Any]


@dataclass
class PollResult:
    """Summary of a single poll cycle."""

    events_fetched: int = 0
    events_new: int = 0
    forecasts_fetched: int = 0
    forecasts_new: int = 0
    duplicates_skipped: int = 0
    errors: list[str] = field(default_factory=list)
    duration_seconds: float = 0.0


class PythiaPoller:
    """Incremental poller for Pythia events and forecasts.

    Args:
        client: PythiaClient instance (already configured).
        on_event: Callback invoked for each new normalized PythiaEvent.
        on_forecast: Callback invoked for each new normalized PythiaForecast.
        checkpoint: CheckpointStore for resume-after state.
        dedupe: EventDeduplicator for content-hash deduplication.
        agent_id: Agent identifier for normalization provenance.
    """

    def __init__(
        self,
        client: PythiaClient,
        on_event: Optional[EventHandler] = None,
        on_forecast: Optional[ForecastHandler] = None,
        checkpoint: Optional[CheckpointStore] = None,
        dedupe: Optional[EventDeduplicator] = None,
        agent_id: str = "pythia-poller",
    ) -> None:
        self.client = client
        self.on_event = on_event
        self.on_forecast = on_forecast
        self.checkpoint = checkpoint or CheckpointStore()
        self.dedupe = dedupe or EventDeduplicator(checkpoint=self.checkpoint)
        self.agent_id = agent_id
        self._stop = False

    def run_once(self, cursor: Optional[str] = None) -> PollResult:
        """Execute a single polling cycle. Returns summary stats."""
        start = time.monotonic()
        result = PollResult()

        if cursor is None:
            cursor = self.checkpoint.get_cursor()

        # --- Fetch events ---
        try:
            raw_events = self._fetch_events_safe(cursor)
        except Exception as exc:
            result.errors.append(f"events_fetch: {exc}")
            logger.error("Event fetch failed: %s", exc)
            raw_events = []

        for raw in raw_events:
            result.events_fetched += 1

            if self.dedupe.is_duplicate_event(raw):
                result.duplicates_skipped += 1
                continue

            try:
                event = normalize_event(raw, agent_id=self.agent_id)
            except ValueError as exc:
                result.errors.append(f"normalize_event: {exc}")
                logger.warning("Event normalization failed: %s", exc)
                continue

            result.events_new += 1

            if self.on_event:
                try:
                    self.on_event(event)
                except Exception as exc:
                    result.errors.append(f"on_event: {exc}")
                    logger.error("on_event handler error: %s", exc)

            self.dedupe.record_event(raw, event_id=event.event_id)
            self.checkpoint.update_event(event.event_id, cursor or datetime.now(timezone.utc).isoformat())

        # --- Fetch forecasts ---
        try:
            raw_forecasts = self._fetch_forecasts_safe(cursor)
        except Exception as exc:
            result.errors.append(f"forecasts_fetch: {exc}")
            logger.error("Forecast fetch failed: %s", exc)
            raw_forecasts = []

        for raw in raw_forecasts:
            result.forecasts_fetched += 1

            if self.dedupe.is_duplicate_forecast(raw):
                result.duplicates_skipped += 1
                continue

            try:
                forecast = normalize_forecast(
                    raw, agent_id=self.agent_id
                )
            except ValueError as exc:
                result.errors.append(f"normalize_forecast: {exc}")
                logger.warning("Forecast normalization failed: %s", exc)
                continue

            result.forecasts_new += 1

            if self.on_forecast:
                try:
                    self.on_forecast(forecast)
                except Exception as exc:
                    result.errors.append(f"on_forecast: {exc}")
                    logger.error("on_forecast handler error: %s", exc)

            self.dedupe.record_forecast(raw, forecast_id=forecast.forecast_id)
            self.checkpoint.update_forecast(forecast.forecast_id)

        # --- Save checkpoint ---
        try:
            self.checkpoint.save()
        except Exception as exc:
            result.errors.append(f"checkpoint_save: {exc}")
            logger.error("Checkpoint save failed: %s", exc)

        result.duration_seconds = time.monotonic() - start
        logger.info(
            "Poll complete: %d new events, %d new forecasts, %d duplicates skipped, %d errors (%.2fs)",
            result.events_new,
            result.forecasts_new,
            result.duplicates_skipped,
            len(result.errors),
            result.duration_seconds,
        )
        return result

    @retry(attempts=3, base_delay=1.0, backoff=2.0)
    def _fetch_events_safe(self, cursor: Optional[str]) -> list[dict[str, Any]]:
        """Fetch events with retry. Returns empty list if no cursor (first run)."""
        if cursor is None:
            logger.info("First poll — fetching latest %d events", POLL_LIMIT)
            events = self.client.get_events(limit=POLL_LIMIT)
        else:
            events = self.client.get_events(after=cursor, limit=POLL_LIMIT)
        return [e.model_dump(mode="json") for e in events]

    @retry(attempts=3, base_delay=1.0, backoff=2.0)
    def _fetch_forecasts_safe(self, cursor: Optional[str]) -> list[dict[str, Any]]:
        """Fetch forecasts with retry. Returns empty list if no cursor (first run)."""
        if cursor is None:
            logger.info("First poll — fetching latest %d forecasts", MAX_FORECASTS_PER_POLL)
            forecasts = self.client.get_forecasts(limit=MAX_FORECASTS_PER_POLL)
        else:
            forecasts = self.client.get_forecasts(after=cursor, limit=MAX_FORECASTS_PER_POLL)
        return [f.model_dump(mode="json") for f in forecasts]

    def stop(self) -> None:
        """Signal the polling loop to stop (graceful shutdown)."""
        self._stop = True
        logger.info("Stop signal received")

    def run_loop(self, interval: int = POLL_INTERVAL) -> None:
        """Run the polling loop until stopped via signal or stop() call.

        Handles SIGINT and SIGTERM for graceful shutdown.
        """
        def _signal_handler(signum: int, frame: Any) -> None:
            logger.info("Received signal %d — stopping poller", signum)
            self._stop = True

        signal.signal(signal.SIGINT, _signal_handler)
        signal.signal(signal.SIGTERM, _signal_handler)

        logger.info("PythiaPoller started (interval=%ds, agent=%s)", interval, self.agent_id)
        while not self._stop:
            try:
                self.run_once()
            except Exception as exc:
                logger.error("Poll cycle error: %s", exc)

            if not self._stop:
                # Sleep in small increments for responsive shutdown
                slept = 0
                while slept < interval and not self._stop:
                    time.sleep(1)
                    slept += 1

        logger.info("PythiaPoller stopped")


def default_event_handler(event: PythiaEvent) -> None:
    """Minimal default handler — logs the event."""
    logger.info(
        "Event: %s [%s] %s (agent=%s)",
        event.event_id,
        event.kind,
        event.title,
        event.source_agent,
    )


def default_forecast_handler(forecast: PythiaForecast) -> None:
    """Minimal default handler — logs the forecast."""
    logger.info(
        "Forecast: %s [%s] %s → %s (agent=%s)",
        forecast.forecast_id,
        forecast.confidence.value,
        forecast.hypothesis,
        forecast.outcome,
        forecast.agent_id,
    )


def main() -> None:
    """CLI entry point: run the poller continuously."""
    import argparse

    logging.basicConfig(
        level=os.environ.get("PYTHIA_LOG_LEVEL", "INFO"),
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    parser = argparse.ArgumentParser(description="Pythia Connector — polling agent")
    parser.add_argument(
        "--interval",
        type=int,
        default=POLL_INTERVAL,
        help="Polling interval in seconds (default: %(default)s)",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single poll cycle and exit",
    )
    parser.add_argument(
        "--agent-id",
        default="pythia-poller",
        help="Agent identifier for normalization provenance",
    )
    args = parser.parse_args()

    from .client import get_client

    client = get_client()
    poller = PythiaPoller(
        client=client,
        on_event=default_event_handler,
        on_forecast=default_forecast_handler,
        agent_id=args.agent_id,
    )

    if args.once:
        result = poller.run_once()
        print(
            f"Poll: {result.events_new} new events, "
            f"{result.forecasts_new} new forecasts, "
            f"{result.duplicates_skipped} duplicates"
        )
    else:
        poller.run_loop(interval=args.interval)


if __name__ == "__main__":
    main()
