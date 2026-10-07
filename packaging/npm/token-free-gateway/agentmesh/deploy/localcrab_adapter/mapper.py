"""Pythia -> LocalCrab field mapping utilities."""

from __future__ import annotations

from typing import Any

from pythia_connector.models import (
    EventSeverity,
    ForecastConfidence,
    ImpactTier,
    PythiaEvent,
    PythiaForecast,
)
from pythia_connector.normalizer import severity_to_numeric, confidence_to_numeric
from pythia_connector.colibri_metrics import ColibriMetrics


def map_event_to_evidence(event: PythiaEvent) -> dict[str, Any]:
    """Map a PythiaEvent to a LocalCrab evidence payload."""
    return {
        "eventId": event.event_id,
        "type": event.kind,
        "content": event.body,
        "sourceAgent": event.source_agent,
        "severity": event.severity.value,
        "severityNumeric": severity_to_numeric(event.severity),
        "timestamp": event.timestamp.isoformat(),
        "cid": event.cid,
        "schemaVersion": event.schema_version,
        "metadata": event.metadata,
    }


def map_event_to_claim(event: PythiaEvent) -> dict[str, Any]:
    """Map a PythiaEvent to a LocalCrab claim payload."""
    statement = event.title if event.title else event.body[:200]
    return {
        "type": "event_claim",
        "statement": statement,
        "sourceEventId": event.event_id,
        "confidence": 1.0 if event.severity == EventSeverity.CRITICAL or event.severity == EventSeverity.FATAL else 0.5,
        "metadata": {
            "severity": event.severity.value,
            "kind": event.kind,
            "sourceAgent": event.source_agent,
        },
    }


def map_forecast_to_claim(forecast: PythiaForecast) -> dict[str, Any]:
    """Map a PythiaForecast to a LocalCrab claim payload."""
    if forecast.confidence_numeric is not None:
        conf_num = forecast.confidence_numeric
    else:
        conf_num = confidence_to_numeric(forecast.confidence) or 0.5

    return {
        "type": "forecast_claim",
        "statement": forecast.hypothesis,
        "outcome": forecast.outcome,
        "confidence": conf_num,
        "sourceAgent": forecast.agent_id,
        "forecastId": forecast.forecast_id,
        "windowStart": forecast.window_start.isoformat() if forecast.window_start else None,
        "windowEnd": forecast.window_end.isoformat() if forecast.window_end else None,
        "horizon": forecast.horizon,
        "supportingEvents": forecast.supporting_events,
        "citations": forecast.citations,
    }


def map_forecast_to_evidence(forecast: PythiaForecast) -> dict[str, Any]:
    """Map a PythiaForecast to a LocalCrab evidence payload."""
    if forecast.confidence_numeric is not None:
        conf = forecast.confidence_numeric
    else:
        conf = confidence_to_numeric(forecast.confidence) or 0.5

    return {
        "eventId": forecast.forecast_id,
        "type": "forecast_prediction",
        "content": f"{forecast.hypothesis} -> {forecast.outcome}",
        "sourceAgent": forecast.agent_id,
        "confidence": conf,
        "confidenceNumeric": forecast.confidence_numeric,
        "timestamp": forecast.created_at.isoformat(),
        "forecastId": forecast.forecast_id,
        "metadata": {
            "confidence": forecast.confidence.value,
            "horizon": forecast.horizon,
        },
    }


def map_colibri_metrics(metrics: ColibriMetrics) -> dict[str, Any]:
    """Map ColibriMetrics to a LocalCrab-compatible metadata payload."""
    return metrics.to_dict()


def map_impact_tier(tier: ImpactTier) -> dict[str, Any]:
    """Map an ImpactTier to LocalCrab metadata."""
    return {
        "tier": tier.value,
        "tierLevel": {
            ImpactTier.LOW: 1,
            ImpactTier.MEDIUM: 2,
            ImpactTier.HIGH: 3,
            ImpactTier.CRITICAL: 4,
        }[tier],
    }


def get_field_mapping(source: str) -> dict[str, str]:
    """Return the field mapping dictionary for a given source type.

    Args:
        source: One of "event", "forecast", "metrics".

    Returns:
        A dict mapping Pythia field names to LocalCrab field names.
    """
    maps: dict[str, dict[str, str]] = {
        "event": {
            "event_id": "eventId",
            "source_agent": "sourceAgent",
            "source_run": "sourceRun",
            "timestamp": "timestamp",
            "kind": "type",
            "severity": "severity",
            "title": "title",
            "body": "content",
            "cid": "cid",
            "schema_version": "schemaVersion",
        },
        "forecast": {
            "forecast_id": "forecastId",
            "agent_id": "sourceAgent",
            "created_at": "createdAt",
            "resolved_at": "resolvedAt",
            "hypothesis": "statement",
            "outcome": "outcome",
            "confidence": "confidence",
            "confidence_numeric": "confidenceNumeric",
            "horizon": "horizon",
            "window_start": "windowStart",
            "window_end": "windowEnd",
            "supporting_events": "supportingEvents",
            "citations": "citations",
            "localcrab_claim_id": "localcrab_claim_id",
        },
        "metrics": {
            "model_name": "modelName",
            "model_cid": "modelCid",
            "vocab_size": "vocabSize",
            "hidden_size": "hiddenSize",
            "num_layers": "numLayers",
            "num_heads": "numHeads",
            "head_dim": "headDim",
            "max_seq_len": "maxSeqLen",
            "tokens_generated": "tokensGenerated",
            "tokens_per_second": "tokensPerSecond",
            "memory_used_mb": "memoryUsedMB",
            "memory_total_mb": "memoryTotalMB",
            "load_time_ms": "loadTimeMs",
            "timestamp": "timestamp",
        },
    }
    return maps.get(source, {})
