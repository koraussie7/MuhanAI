"""Normalize raw Pythia event/forecast data into canonical schemas."""

from __future__ import annotations

from typing import Any

from pythia_connector.models import (
    EventSeverity,
    ForecastConfidence,
    PythiaEvent,
    PythiaForecast,
    WebhookPayload,
)


def normalize_event(raw: dict[str, Any]) -> PythiaEvent:
    """Convert a raw event dict into a PythiaEvent.

    Handles common source-field name variations and fills in defaults.
    """
    field_map = {
        "event_id": raw.get("event_id") or raw.get("id"),
        "source_agent": raw.get("source_agent") or raw.get("agent") or raw.get("source"),
        "source_run": raw.get("source_run") or raw.get("run_id"),
        "timestamp": raw.get("timestamp") or raw.get("ts") or raw.get("created_at"),
        "kind": raw.get("kind") or raw.get("type") or raw.get("event_type", "generic"),
        "severity": raw.get("severity") or raw.get("level", "info"),
        "title": raw.get("title") or raw.get("name") or raw.get("summary", ""),
        "body": raw.get("body") or raw.get("description") or raw.get("content", ""),
        "metadata": raw.get("metadata", raw.get("extra", {})),
        "cid": raw.get("cid") or raw.get("content_id"),
        "schema_version": raw.get("schema_version", "1.0.0"),
    }

    field_map = {k: v for k, v in field_map.items() if v is not None}
    return PythiaEvent.model_validate(field_map)


def normalize_forecast(raw: dict[str, Any]) -> PythiaForecast:
    """Convert a raw forecast dict into a PythiaForecast.

    Handles common source-field name variations and fills in defaults.
    """
    field_map = {
        "forecast_id": raw.get("forecast_id") or raw.get("id"),
        "agent_id": raw.get("agent_id") or raw.get("agent"),
        "created_at": raw.get("created_at") or raw.get("timestamp"),
        "resolved_at": raw.get("resolved_at"),
        "hypothesis": raw.get("hypothesis") or raw.get("question", ""),
        "outcome": raw.get("outcome") or raw.get("prediction", ""),
        "confidence": raw.get("confidence"),
        "confidence_numeric": raw.get("confidence_numeric") or raw.get("confidence_score"),
        "horizon": raw.get("horizon"),
        "window_start": raw.get("window_start") or raw.get("start_time"),
        "window_end": raw.get("window_end") or raw.get("end_time"),
        "supporting_events": raw.get("supporting_events", raw.get("evidence", [])),
        "citations": raw.get("citations", raw.get("sources", [])),
        "localcrab_claim_id": raw.get("localcrab_claim_id") or raw.get("claim_id"),
    }

    field_map = {k: v for k, v in field_map.items() if v is not None}
    return PythiaForecast.model_validate(field_map)


def normalize_webhook_payload(raw: dict[str, Any]) -> WebhookPayload:
    """Convert a raw webhook payload into a WebhookPayload model."""
    return WebhookPayload.model_validate(raw)


def normalize_event_batch(raw_events: list[dict[str, Any]]) -> list[PythiaEvent]:
    """Normalize a batch of raw event dicts, skipping entries that fail validation."""
    events: list[PythiaEvent] = []
    for raw in raw_events:
        try:
            events.append(normalize_event(raw))
        except Exception:
            continue
    return events


def normalize_forecast_batch(raw_forecasts: list[dict[str, Any]]) -> list[PythiaForecast]:
    """Normalize a batch of raw forecast dicts, skipping invalid entries."""
    forecasts: list[PythiaForecast] = []
    for raw in raw_forecasts:
        try:
            forecasts.append(normalize_forecast(raw))
        except Exception:
            continue
    return forecasts


def extract_metadata_value(event: PythiaEvent, key: str, default: Any = None) -> Any:
    """Safely extract a value from an event's metadata."""
    return event.metadata.get(key, default)


def severity_to_numeric(severity: EventSeverity | str) -> int:
    """Map an EventSeverity to a numeric level (0=info, ..., 3=fatal)."""
    if isinstance(severity, str):
        severity = EventSeverity(severity)
    return {
        EventSeverity.INFO: 0,
        EventSeverity.WARNING: 1,
        EventSeverity.CRITICAL: 2,
        EventSeverity.FATAL: 3,
    }[severity]


def confidence_to_numeric(confidence: ForecastConfidence | str | float | None) -> float | None:
    """Map a ForecastConfidence to a numeric score (0.0-1.0)."""
    if confidence is None:
        return None
    if isinstance(confidence, float):
        return confidence
    if isinstance(confidence, str):
        confidence = ForecastConfidence(confidence)
    return {
        ForecastConfidence.LOW: 0.4,
        ForecastConfidence.MEDIUM: 0.7,
        ForecastConfidence.HIGH: 0.9,
        ForecastConfidence.CERTAIN: 1.0,
    }[confidence]
