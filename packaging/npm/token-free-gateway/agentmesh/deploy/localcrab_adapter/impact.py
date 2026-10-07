"""Impact tier application for Pythia events and forecasts."""

from __future__ import annotations

import logging
from typing import Any

from pythia_connector.models import (
    EventSeverity,
    ForecastConfidence,
    ImpactTier,
    PythiaEvent,
    PythiaForecast,
)
from pythia_connector.colibri_metrics import ColibriMetrics
from localcrab_adapter.client import LocalCrabClient
from localcrab_adapter.graph_writer import GraphWriter

logger = logging.getLogger(__name__)


class ImpactAnalyzer:
    """Computes impact tiers for events and forecasts based on severity,
    confidence, network effects, and Colibri engine metrics.
    """

    def __init__(
        self,
        client: LocalCrabClient | None = None,
        graph_writer: GraphWriter | None = None,
    ):
        self.client = client
        self.graph_writer = graph_writer or (GraphWriter(client) if client else None)
        self._analyses: list[dict[str, Any]] = []

    def compute_event_impact(
        self,
        event: PythiaEvent,
        affected_agents: list[str] | None = None,
    ) -> dict[str, Any]:
        """Compute an ImpactAnalysis for a PythiaEvent."""
        severity = event.severity
        score = self._severity_to_score(severity)

        # Boost score for critical/fatal events
        if severity in (EventSeverity.CRITICAL, EventSeverity.FATAL):
            score = min(score + 0.3, 1.0)

        # Lower score for low-severity info events with no supporting data
        if severity == EventSeverity.INFO and not event.metadata:
            score = max(score - 0.1, 0.0)

        tier = self._score_to_tier(score)
        affected_agents = affected_agents or [event.source_agent]

        analysis = {
            "target_id": event.event_id,
            "target_type": "event",
            "tier": tier.value,
            "score": score,
            "affected_agents": affected_agents,
            "affected_domains": list(event.metadata.keys()) if event.metadata else [],
            "rationale": self._event_rationale(event, severity, score, tier),
            "mitigations": self._event_mitigations(severity),
            "generated_by": "ImpactAnalyzer",
            "colibri_metrics_ref": None,
        }
        self._analyses.append(analysis)
        return analysis

    def compute_forecast_impact(
        self,
        forecast: PythiaForecast,
        affected_agents: list[str] | None = None,
    ) -> dict[str, Any]:
        """Compute an ImpactAnalysis for a PythiaForecast."""
        conf_num = forecast.confidence_numeric or 0.5
        score = conf_num

        # Adjust based on confidence level
        if forecast.confidence == ForecastConfidence.LOW:
            score = min(score, 0.3)
        elif forecast.confidence == ForecastConfidence.CERTAIN:
            score = max(score, 0.8)

        tier = self._score_to_tier(score)
        affected_agents = affected_agents or [forecast.agent_id]

        analysis = {
            "target_id": forecast.forecast_id,
            "target_type": "forecast",
            "tier": tier.value,
            "score": score,
            "affected_agents": affected_agents,
            "affected_domains": [],
            "rationale": self._forecast_rationale(forecast, score, tier),
            "mitigations": self._forecast_mitigations(tier),
            "generated_by": "ImpactAnalyzer",
        }
        self._analyses.append(analysis)
        return analysis

    def apply_impact(
        self,
        target_id: str,
        target_type: str,
        tier: ImpactTier,
        score: float,
        affected_agents: list[str],
        rationale: str,
        mitigations: list[str] | None = None,
    ) -> dict[str, Any]:
        """Apply an impact analysis to the graph, creating edges."""
        if not self.graph_writer:
            return {"status": "skipped", "reason": "no graph writer"}

        edge_metadata = {
            "tier": tier.value,
            "score": score,
            "rationale": rationale,
        }

        for agent in affected_agents:
            self.graph_writer.impacts(
                source_id=target_id,
                target_id=agent,
                edge_type="impacts",
                impact_score=score,
                tier=tier.value,
            ) if hasattr(self.graph_writer, 'impacts') else None

        return {
            "target_id": target_id,
            "target_type": target_type,
            "tier": tier.value,
            "score": score,
            "affected_agents": affected_agents,
            "mitigations": mitigations or [],
        }

    def tier_from_score(self, score: float) -> ImpactTier:
        """Map a numeric score to an ImpactTier."""
        return self._score_to_tier(score)

    @staticmethod
    def _severity_to_score(severity: EventSeverity) -> float:
        return {
            EventSeverity.INFO: 0.1,
            EventSeverity.WARNING: 0.3,
            EventSeverity.CRITICAL: 0.6,
            EventSeverity.FATAL: 0.9,
        }[severity]

    @staticmethod
    def _score_to_tier(score: float) -> ImpactTier:
        if score >= 0.75:
            return ImpactTier.CRITICAL
        if score >= 0.5:
            return ImpactTier.HIGH
        if score >= 0.25:
            return ImpactTier.MEDIUM
        return ImpactTier.LOW

    @staticmethod
    def _event_rationale(event: PythiaEvent, severity: EventSeverity, score: float, tier: ImpactTier) -> str:
        return (
            f"Event '{event.title}' has {severity.value} severity "
            f"(score={score:.2f}), resulting in {tier.value} impact tier. "
            f"Source: {event.source_agent}, Kind: {event.kind}."
        )

    @staticmethod
    def _forecast_rationale(forecast: PythiaForecast, score: float, tier: ImpactTier) -> str:
        return (
            f"Forecast '{forecast.hypothesis}' has confidence={score:.2f} "
            f"({forecast.confidence.value}), resulting in {tier.value} impact tier. "
            f"Horizon: {forecast.horizon or 'N/A'}."
        )

    @staticmethod
    def _event_mitigations(severity: EventSeverity) -> list[str]:
        if severity == EventSeverity.FATAL:
            return ["immediate escalation", "fallback to native inference", "activate backup nodes"]
        if severity == EventSeverity.CRITICAL:
            return ["increase monitoring", "activate colibri WASM fallback", "notify agent mesh"]
        if severity == EventSeverity.WARNING:
            return ["increased logging", "verify data integrity"]
        return ["standard monitoring"]

    @staticmethod
    def _forecast_mitigations(tier: ImpactTier) -> list[str]:
        if tier == ImpactTier.CRITICAL:
            return ["validate prediction", "cross-check with multiple models", "engage human review"]
        if tier == ImpactTier.HIGH:
            return ["track closely", "verify supporting evidence"]
        if tier == ImpactTier.MEDIUM:
            return ["monitor for updates", "track supporting events"]
        return ["log for audit trail"]

    @property
    def analysis_count(self) -> int:
        return len(self._analyses)

    @property
    def analyses(self) -> list[dict[str, Any]]:
        return self._analyses.copy()
