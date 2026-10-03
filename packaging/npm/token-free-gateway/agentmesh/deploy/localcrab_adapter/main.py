"""Main entry point — wires Pythia Connector (Part 1) + LocalCrab Adapter (Part 2).

This is the integration orchestrator that:
  1. Listens for Pythia events (via poller or webhook)
  2. Normalizes them to canonical PythiaEvent/PythiaForecast/ImpactAnalysis
  3. Writes evidence to LocalCrab via EvidenceWriter
  4. Creates claims via ForecastLedger
  5. Writes graph edges via GraphWriter
  6. Applies impact analysis via ImpactAdapter
  7. Emits ColibriMetrics packets for the W5 dashboard

Run standalone:
    python3 -m localcrab_adapter.main --mode poll --interval 60

Or import and use programmatically:
    from localcrab_adapter.main import IntegrationOrchestrator
    orchestrator = IntegrationOrchestrator()
    orchestrator.start()
"""

from __future__ import annotations

import argparse
import logging
import os
import signal
import sys
import time
from datetime import datetime, timezone
from typing import Any, Optional

from pythia_connector.checkpoint import CheckpointStore
from pythia_connector.client import PythiaClient, get_client
from pythia_connector.colibri_metrics import build_colibri_metrics_packet
from pythia_connector.dedupe import EventDeduplicator
from pythia_connector.models import ImpactAnalysis, ImpactTier, PythiaEvent, PythiaForecast
from pythia_connector.normalizer import normalize_event, normalize_forecast
from pythia_connector.poller import PythiaPoller
from pythia_connector.webhook import start_webhook_server

from localcrab_adapter.client import LocalCrabClient
from localcrab_adapter.evidence_writer import EvidenceWriter
from localcrab_adapter.forecast_ledger import ForecastLedger
from localcrab_adapter.graph_writer import GraphWriter
from localcrab_adapter.impact import ImpactAdapter
from localcrab_adapter.mapper import (
    impact_to_claim_metadata,
    impact_to_graph_edges,
)

logger = logging.getLogger("localcrab_adapter.main")


class IntegrationOrchestrator:
    """Orchestrates data flow: Pythia → LocalCrab → ColibriMetrics.

    Args:
        pythia_client: PythiaClient for fetching events/forecasts.
        localcrab_client: LocalCrabClient for evidence/claim/graph submission.
        checkpoint: Shared CheckpointStore across all components.
        agent_id: Identifier for this integration instance.
    """

    def __init__(
        self,
        pythia_client: Optional[PythiaClient] = None,
        localcrab_client: Optional[LocalCrabClient] = None,
        checkpoint: Optional[CheckpointStore] = None,
        agent_id: str = "orchestrator",
    ) -> None:
        self.pythia_client = pythia_client or get_client()
        self.localcrab_client = localcrab_client or LocalCrabClient()
        self.checkpoint = checkpoint or CheckpointStore()
        self.agent_id = agent_id

        # Sub-components
        self.dedupe = EventDeduplicator(checkpoint=self.checkpoint)
        self.evidence_writer = EvidenceWriter(
            client=self.localcrab_client, checkpoint=self.checkpoint
        )
        self.ledger = ForecastLedger(
            client=self.localcrab_client, checkpoint=self.checkpoint
        )
        self.graph_writer = GraphWriter(client=self.localcrab_client)
        self.impact_adapter = ImpactAdapter(
            client=self.localcrab_client, ledger=self.ledger
        )

        # Stats
        self._events_processed: int = 0
        self._forecasts_processed: int = 0
        self._impacts_applied: int = 0

    def on_event(self, event: PythiaEvent) -> Optional[str]:
        """Handle a normalized PythiaEvent.

        Pipeline:
          1. Write evidence to LocalCrab
          2. Write evidence chain to graph (DERIVED_FROM if parent exists)
        """
        evidence_id = self.evidence_writer.write_event(event)

        if evidence_id and event.parent_event_id:
            # Link to parent evidence in graph
            self.graph_writer.write_evidence_chain(
                event,
                parent_evidence_id=event.parent_event_id,
            )

        self._events_processed += 1
        return evidence_id

    def on_forecast(self, forecast: PythiaForecast) -> Optional[str]:
        """Handle a normalized PythiaForecast.

        Pipeline:
          1. Submit as claim to LocalCrab via ForecastLedger
          2. Write prediction graph (PREDICTS, EVIDENCE edges)
        """
        evidence_ids = []
        for event_id in forecast.supporting_events:
            if self.checkpoint.has_event(event_id):
                evidence_ids.append(event_id)

        claim_id = self.ledger.submit_forecast(
            forecast, evidence_ids=evidence_ids
        )

        if claim_id:
            self.graph_writer.write_forecast_prediction(forecast, claim_id)

            # Link evidence to claim
            for eid in evidence_ids:
                self.graph_writer.link_evidence_to_claim(eid, claim_id, supports=True)

        self._forecasts_processed += 1
        return claim_id

    def on_impact(self, impact: ImpactAnalysis) -> bool:
        """Handle an ImpactAnalysis by applying it to the relevant claim."""
        result = self.impact_adapter.apply_impact(impact)
        if result:
            self._impacts_applied += 1
        return result

    def build_metrics_packet(self) -> dict[str, Any]:
        """Build a ColibriMetrics packet for dashboard reporting."""
        now = datetime.now(timezone.utc)

        # Get recent events/forecasts from checkpoint
        event_ids = list(self.checkpoint.state.processed_event_ids)[-50:]
        forecast_ids = list(self.checkpoint.state.seen_forecast_ids)[-50:]

        # Build placeholder metrics (in production, read from actual Colibri WASM stats)
        return build_colibri_metrics_packet(
            events=[],  # in production, query recent events
            forecasts=[],
            impacts=[],
            model_cid=os.environ.get("COLIBRI_MODEL_CID", ""),
            model_name=os.environ.get("COLIBRI_MODEL_NAME", "unloaded"),
            model_loaded=self.ledger._mapping.__len__() > 0,
            model_quantization=os.environ.get("COLIBRI_QUANTIZATION", "fp16"),
            model_file_size=int(os.environ.get("COLIBRI_MODEL_SIZE", "0")),
        )

    def run_poll_cycle(self) -> dict[str, int]:
        """Execute a single poll cycle and return stats."""
        poller = PythiaPoller(
            client=self.pythia_client,
            on_event=self.on_event,
            on_forecast=self.on_forecast,
            checkpoint=self.checkpoint,
            dedupe=self.dedupe,
            agent_id=self.agent_id,
        )
        result = poller.run_once()

        stats = {
            "events_processed": self._events_processed,
            "forecasts_processed": self._forecasts_processed,
            "impacts_applied": self._impacts_applied,
            "poll_events_fetched": result.events_fetched,
            "poll_events_new": result.events_new,
            "poll_forecasts_fetched": result.forecasts_fetched,
            "poll_forecasts_new": result.forecasts_new,
            "poll_duplicates_skipped": result.duplicates_skipped,
            "poll_errors": len(result.errors),
        }

        logger.info("Poll cycle stats: %s", json_dumps_safe(stats))
        return stats

    def start(self, mode: str = "poll", interval: int = 60) -> None:
        """Start the integration in the specified mode.

        Args:
            mode: 'poll' (continuous polling) or 'webhook' (HTTP webhook server).
            interval: Polling interval in seconds (poll mode only).
        """
        def _signal_handler(signum: int, frame: Any) -> None:
            logger.info("Received signal %d — shutting down", signum)
            self.shutdown()

        signal.signal(signal.SIGINT, _signal_handler)
        signal.signal(signal.SIGTERM, _signal_handler)

        if mode == "poll":
            logger.info("Starting in polling mode (interval=%ds)", interval)
            self._poll_loop(interval)
        elif mode == "webhook":
            logger.info("Starting in webhook mode")
            start_webhook_server(
                on_event=self.on_event,
                on_forecast=self.on_forecast,
                checkpoint=self.checkpoint,
            )
        else:
            raise ValueError(f"Unknown mode: {mode}")

    def _poll_loop(self, interval: int) -> None:
        """Continuous polling loop."""
        while True:
            try:
                self.run_poll_cycle()
            except Exception as exc:
                logger.error("Poll cycle error: %s", exc)
            time.sleep(interval)

    def shutdown(self) -> None:
        """Graceful shutdown."""
        self.evidence_writer.close()
        self.ledger.close()
        self.graph_writer.close()
        self.impact_adapter.close()
        self.localcrab_client.close()
        self.pythia_client.close()
        logger.info("IntegrationOrchestrator shut down cleanly")

    def __enter__(self) -> "IntegrationOrchestrator":
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.shutdown()


def json_dumps_safe(obj: Any) -> str:
    """Safe JSON dump for logging."""
    try:
        return __import__("json").dumps(obj, default=str)
    except Exception:
        return str(obj)


def main() -> None:
    """CLI entry point."""
    logging.basicConfig(
        level=os.environ.get("LOCALCRAB_LOG_LEVEL", "INFO"),
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    parser = argparse.ArgumentParser(
        description="LocalCrab Adapter — Pythia→LocalCrab integration orchestrator"
    )
    parser.add_argument(
        "--mode", choices=["poll", "webhook"], default="poll",
        help="Run mode: poll (continuous) or webhook (HTTP server)",
    )
    parser.add_argument("--interval", type=int, default=60, help="Poll interval (seconds)")
    parser.add_argument("--agent-id", default="orchestrator", help="Agent identifier")
    parser.add_argument(
        "--once", action="store_true",
        help="Run a single poll cycle and exit (poll mode only)",
    )
    args = parser.parse_args()

    orchestrator = IntegrationOrchestrator(agent_id=args.agent_id)

    if args.once:
        stats = orchestrator.run_poll_cycle()
        print(f"Processed: {stats}")
    else:
        orchestrator.start(mode=args.mode, interval=args.interval)


if __name__ == "__main__":
    main()
