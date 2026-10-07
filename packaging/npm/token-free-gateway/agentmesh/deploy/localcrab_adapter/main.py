"""Integration orchestrator for Pythia → LocalCrab → Fellowship P2P pipeline."""

from __future__ import annotations

import logging
import os
import signal
import sys
import time
from typing import Any

from pythia_connector.client import PythiaClient
from pythia_connector.checkpoint import CheckpointManager
from pythia_connector.dedupe import Deduper
from pythia_connector.models import PythiaEvent, PythiaForecast
from pythia_connector.poller import EventPoller

from localcrab_adapter.client import LocalCrabClient
from localcrab_adapter.evidence_writer import EvidenceWriter
from localcrab_adapter.forecast_ledger import ForecastLedger
from localcrab_adapter.graph_writer import GraphWriter
from localcrab_adapter.impact import ImpactAnalyzer

logger = logging.getLogger(__name__)


class IntegrationOrchestrator:
    """Orchestrates the end-to-end flow: Pythia events → LocalCrab → Fellowship.

    The pipeline:
      1. Poll Pythia for new events and forecasts (with checkpoint/dedup)
      2. Write evidence to LocalCrab (batched)
      3. Create claims for significant events/forecasts
      4. Write graph edges (supports, derived_from, impacts)
      5. Compute impact analysis
      6. Push metrics to Fellowship node
    """

    def __init__(
        self,
        pythia_url: str | None = None,
        localcrab_url: str | None = None,
        checkpoint_path: str | None = None,
        poll_interval: float = 5.0,
        batch_size: int = 10,
        fellowship_url: str | None = None,
    ):
        self.pythia = PythiaClient(api_url=pythia_url)
        self.localcrab = LocalCrabClient(api_url=localcrab_url)
        self.checkpoint = CheckpointManager(checkpoint_path or "checkpoint.json")
        self.deduper = Deduper()
        self.poller = EventPoller(
            client=self.pythia,
            checkpoint=self.checkpoint,
            dedup_hashes=self.deduper.seen_hashes if hasattr(self.deduper, 'hashes') else None,
        )
        self.evidence_writer = EvidenceWriter(self.localcrab, batch_size=batch_size)
        self.graph_writer = GraphWriter(self.localcrab)
        self.forecast_ledger = ForecastLedger(self.localcrab, self.graph_writer)
        self.impact_analyzer = ImpactAnalyzer(self.localcrab, self.graph_writer)
        self.poll_interval = poll_interval
        self.fellowship_url = fellowship_url or os.environ.get("FELLOWSHIP_URL", "http://localhost:3001")
        self._running = False

    def process_event(self, event: PythiaEvent) -> dict[str, Any]:
        """Process a single event through the full pipeline."""
        logger.info("Processing event: %s (%s)", event.event_id, event.kind)

        # Write evidence
        evidence = self.evidence_writer.write_event(event)

        # Create claim for the event
        from localcrab_adapter.mapper import map_event_to_claim
        claim_data = map_event_to_claim(event)
        try:
            claim_result = self.localcrab.create_claim(
                claim_type=claim_data["type"],
                statement=claim_data["statement"],
                confidence=claim_data["confidence"],
                metadata=claim_data.get("metadata", {}),
            )
            claim_id = claim_result.get("id")
        except Exception as e:
            logger.error("Failed to create claim for event %s: %s", event.event_id, e)
            claim_id = None

        # Compute impact
        impact = self.impact_analyzer.compute_event_impact(event)

        # Push to Fellowship node
        self._push_to_fellowship(event, claim_id, impact)

        return {
            "event_id": event.event_id,
            "evidence_written": evidence is not None,
            "claim_id": claim_id,
            "impact_tier": impact["tier"],
        }

    def process_forecast(self, forecast: PythiaForecast) -> dict[str, Any]:
        """Process a single forecast through the full pipeline."""
        logger.info("Processing forecast: %s", forecast.forecast_id)

        # Register in LocalCrab via forecast ledger
        try:
            result = self.forecast_ledger.register_forecast(forecast)
            claim_id = result.get("claim", {}).get("id")
        except Exception as e:
            logger.error("Failed to register forecast %s: %s", forecast.forecast_id, e)
            claim_id = None

        # Compute impact
        impact = self.impact_analyzer.compute_forecast_impact(forecast)

        # Push to Fellowship
        self._push_to_fellowship(forecast, claim_id, impact)

        return {
            "forecast_id": forecast.forecast_id,
            "claim_id": claim_id,
            "impact_tier": impact["tier"],
        }

    def process_batch(self) -> dict[str, Any]:
        """Process a batch of new events and forecasts."""
        events = self.poller.poll_once(limit=100)
        forecasts = self.poller.poll_forecasts(limit=50)

        event_results = [self.process_event(e) for e in events]
        forecast_results = [self.process_forecast(f) for f in forecasts]

        # Flush any remaining evidence
        self.evidence_writer.flush()

        return {
            "events_processed": len(event_results),
            "forecasts_processed": len(forecast_results),
            "event_results": event_results,
            "forecast_results": forecast_results,
        }

    def _push_to_fellowship(
        self,
        event_or_forecast: PythiaEvent | PythiaForecast,
        claim_id: str | None,
        impact: dict[str, Any],
    ) -> None:
        """Push processed data to the Fellowship node via HTTP."""
        try:
            import requests

            payload = {
                "source": "pythia_connector",
                "kind": "event" if isinstance(event_or_forecast, PythiaEvent) else "forecast",
                "targetId": event_or_forecast.event_id if isinstance(event_or_forecast, PythiaEvent) else event_or_forecast.forecast_id,
                "claimId": claim_id,
                "impact": impact,
            }
            self.pythia._session.post(
                f"{self.fellowship_url}/api/memory/sync",
                json=payload,
                timeout=10,
            )
        except Exception as e:
            logger.warning("Failed to push to Fellowship: %s", e)

    def run_forever(self) -> None:
        """Run the integration pipeline continuously until interrupted."""
        self._running = True

        def handle_signal(signum, frame):
            logger.info("Received signal %d, shutting down...", signum)
            self._running = False

        signal.signal(signal.SIGINT, handle_signal)
        signal.signal(signal.SIGTERM, handle_signal)

        logger.info("Starting integration orchestrator (interval=%.1fs)", self.poll_interval)
        while self._running:
            try:
                result = self.process_batch()
                if result["events_processed"] or result["forecasts_processed"]:
                    logger.info(
                        "Processed %d events, %d forecasts",
                        result["events_processed"],
                        result["forecasts_processed"],
                    )
            except Exception as e:
                logger.error("Error during processing cycle: %s", e)
            time.sleep(self.poll_interval)

        # Final flush
        try:
            self.evidence_writer.flush()
        except Exception:
            pass
        self.pythia.close()
        self.localcrab.close()
        logger.info("Integration orchestrator stopped")

    @classmethod
    def from_env(cls) -> "IntegrationOrchestrator":
        """Create an orchestrator from environment variables."""
        return cls(
            pythia_url=os.environ.get("PYTHIA_API_URL"),
            localcrab_url=os.environ.get("LOCALCRAB_API_URL"),
            checkpoint_path=os.environ.get("CHECKPOINT_PATH", "checkpoint.json"),
            poll_interval=float(os.environ.get("POLL_INTERVAL", "5.0")),
            batch_size=int(os.environ.get("BATCH_SIZE", "10")),
            fellowship_url=os.environ.get("FELLOWSHIP_URL"),
        )


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    orchestrator = IntegrationOrchestrator.from_env()
    orchestrator.run_forever()


if __name__ == "__main__":
    main()
