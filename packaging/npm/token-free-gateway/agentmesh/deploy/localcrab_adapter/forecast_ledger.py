"""Forecast ↔ LocalCrab claim tracking."""

from __future__ import annotations

import logging
from typing import Any

from pythia_connector.models import PythiaForecast
from localcrab_adapter.client import LocalCrabClient
from localcrab_adapter.mapper import map_forecast_to_claim
from localcrab_adapter.graph_writer import GraphWriter

logger = logging.getLogger(__name__)


class ForecastLedger:
    """Tracks the relationship between Pythia forecasts and LocalCrab claims.

    Maintains an in-memory mapping of forecast_id → claim_id.
    """

    def __init__(
        self,
        client: LocalCrabClient,
        graph_writer: GraphWriter | None = None,
    ):
        self.client = client
        self.graph_writer = graph_writer or GraphWriter(client)
        self._ledger: dict[str, str] = {}
        self._reverse: dict[str, str] = {}

    def register_forecast(self, forecast: PythiaForecast) -> dict[str, Any]:
        """Register a forecast as a claim in LocalCrab.

        Returns the claim data including the claim_id.
        """
        claim_data = map_forecast_to_claim(forecast)
        claim_data["localcrab_claim_id"] = None

        try:
            evidence = self.client.create_claim_with_evidence(
                claim_type="forecast_claim",
                statement=forecast.hypothesis,
                content=f"{forecast.hypothesis} -> {forecast.outcome}",
                evidence_type="forecast_prediction",
                confidence=forecast.confidence_numeric or 0.5,
                source_agent=forecast.agent_id,
                metadata={
                    "forecastId": forecast.forecast_id,
                    "hypothesis": forecast.hypothesis,
                    "outcome": forecast.outcome,
                    "confidence": forecast.confidence.value,
                    "horizon": forecast.horizon,
                },
            )
            claim_id = evidence["claim"].get("id")
            evidence_id = evidence["evidence"].get("id")

            if claim_id:
                self._ledger[forecast.forecast_id] = claim_id
                self._reverse[claim_id] = forecast.forecast_id
                forecast.localcrab_claim_id = claim_id

            # Graph: evidence supports claim
            if evidence_id and claim_id:
                self.graph_writer.supports(evidence_id, claim_id)

            # Graph: forecast derived from supporting events
            for event_id in forecast.supporting_events:
                self.graph_writer.derived_from(claim_id or "", event_id)

            return evidence
        except Exception as e:
            logger.error("Failed to register forecast %s: %s", forecast.forecast_id, e)
            raise

    def get_claim_id(self, forecast_id: str) -> str | None:
        """Look up the LocalCrab claim ID for a Pythia forecast ID."""
        if forecast_id in self._ledger:
            return self._ledger[forecast_id]
        try:
            result = self.client.get_forecast_claim(forecast_id)
            claim_id = result.get("claimId") or result.get("id")
            if claim_id:
                self._ledger[forecast_id] = claim_id
                self._reverse[claim_id] = forecast_id
                return claim_id
        except Exception as e:
            logger.warning("Failed to look up claim for forecast %s: %s", forecast_id, e)
        return None

    def get_forecast_id(self, claim_id: str) -> str | None:
        """Look up the Pythia forecast ID for a LocalCrab claim ID."""
        if claim_id in self._reverse:
            return self._reverse[claim_id]
        return None

    def link_forecasts(self, source_forecast: str, target_claim: str, **metadata: Any) -> dict[str, Any]:
        """Create a graph edge linking a source forecast to a target claim."""
        return self.graph_writer.related_to(source_forecast, target_claim, **metadata)

    @property
    def registered_count(self) -> int:
        return len(self._ledger)
