"""Normalize raw Pythia payloads into canonical MuhanAI schemas.

Pythia emits events and forecasts in a slightly different shape than what
the P2PCLAW collective expects. This module bridges the gap:

  raw_pythia_json → PythiaEvent / PythiaForecast / ImpactAnalysis
                    (valid Pydantic models per models.py)

The normalizer is tolerant of schema drift: unknown fields are preserved
in `metadata` for debugging but never cause a hard failure unless a
required field is missing.
"""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from .models import (
    EventSeverity,
    ForecastConfidence,
    ImpactAnalysis,
    ImpactTier,
    PythiaEvent,
    PythiaForecast,
)

logger = logging.getLogger("pythia_connector.normalizer")

# Heuristic field maps: raw Pythia keys → schema fields
EVENT_FIELD_MAP: dict[str, str] = {
    "id": "event_id",
    "eventId": "event_id",
    "event_id": "event_id",
    "agent": "source_agent",
    "agentId": "source_agent",
    "source_agent": "source_agent",
    "source": "source_agent",
    "runId": "source_run",
    "run_id": "source_run",
    "source_run": "source_run",
    "ts": "timestamp",
    "time": "timestamp",
    "timestamp": "timestamp",
    "type": "kind",
    "eventType": "kind",
    "kind": "kind",
    "priority": "severity",
    "level": "severity",
    "severity": "severity",
    "msg": "body",
    "message": "body",
    "summary": "body",
    "body": "body",
    "title": "title",
}

FORECAST_FIELD_MAP: dict[str, str] = {
    "id": "forecast_id",
    "forecastId": "forecast_id",
    "forecast_id": "forecast_id",
    "agent": "agent_id",
    "agentId": "agent_id",
    "source": "agent_id",
    "agent_id": "agent_id",
    "prediction": "outcome",
    "predict": "outcome",
    "question": "hypothesis",
    "hypothesis": "hypothesis",
    "outcome": "outcome",
    "confidenceValue": "confidence_numeric",
    "confidence_numeric": "confidence_numeric",
    "confidence": "confidence",
    "horizon": "horizon",
    "window": "horizon",
    "expiresAt": "window_end",
    "expires_at": "window_end",
    "window_end": "window_end",
    "startsAt": "window_start",
    "starts_at": "window_start",
    "window_start": "window_start",
    "created_at": "created_at",
    "createdAt": "created_at",
    "resolved_at": "resolved_at",
    "resolvedAt": "resolved_at",
    "supporting_events": "supporting_events",
    "citations": "citations",
}


def _generate_id(seed: str) -> str:
    """Generate a deterministic UUIDv7-style ID from a seed string.

    Uses SHA-256 hash to ensure reproducibility across agents.
    This guarantees the same Pythia event always maps to the same
    PythiaEvent.event_id — critical for cross-agent dedup.
    """
    h = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    # Construct a UUIDv7-like string from the hash
    # (time-ordered prefix is approximated; exact v7 not required)
    return f"py-{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def _parse_timestamp(raw: Any) -> datetime:
    """Parse a timestamp from various formats Pythia may send."""
    if raw is None:
        return datetime.now(timezone.utc)
    if isinstance(raw, (int, float)):
        return datetime.fromtimestamp(raw, tz=timezone.utc)
    if isinstance(raw, str):
        raw = raw.strip()
        # Try ISO 8601
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            pass
        # Try Unix timestamp string
        try:
            return datetime.fromtimestamp(float(raw), tz=timezone.utc)
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def _map_severity(raw: Any) -> EventSeverity:
    """Map a raw severity/priority value to EventSeverity enum."""
    if raw is None:
        return EventSeverity.INFO
    raw_str = str(raw).upper().strip()
    # Direct enum match
    for sev in EventSeverity:
        if raw_str == sev.value.upper():
            return sev
    # Keyword matching
    if any(kw in raw_str for kw in ("CRIT", "FATAL", "SEVERE")):
        return EventSeverity.CRITICAL if "FATAL" not in raw_str else EventSeverity.FATAL
    if "WARN" in raw_str or "HIGH" in raw_str:
        return EventSeverity.WARNING
    return EventSeverity.INFO


def _map_confidence(raw: Any) -> tuple[ForecastConfidence, Optional[float]]:
    """Map a raw confidence value to (enum, numeric) pair."""
    if raw is None:
        return ForecastConfidence.MEDIUM, None

    if isinstance(raw, (int, float)):
        numeric = float(raw)
        if numeric >= 0.8:
            return ForecastConfidence.HIGH, numeric
        if numeric >= 0.6:
            return ForecastConfidence.MEDIUM, numeric
        return ForecastConfidence.LOW, numeric

    raw_str = str(raw).upper().strip()
    for conf in ForecastConfidence:
        if raw_str == conf.value.upper():
            if conf == ForecastConfidence.CERTAIN:
                numeric: Optional[float] = 1.0
            elif conf == ForecastConfidence.HIGH:
                numeric = 0.85
            elif conf == ForecastConfidence.MEDIUM:
                numeric = 0.65
            else:
                numeric = 0.35
            return conf, numeric

    if any(kw in raw_str for kw in ("HIGH", "CONFIDENT")):
        return ForecastConfidence.HIGH, 0.8
    if any(kw in raw_str for kw in ("LOW", "UNCERTAIN")):
        return ForecastConfidence.LOW, 0.3
    return ForecastConfidence.MEDIUM, 0.5


def _normalize_fields(raw: dict[str, Any], field_map: dict[str, str]) -> dict[str, Any]:
    """Apply a field map, collecting unmapped keys into 'metadata_rest'."""
    normalized: dict[str, Any] = {}
    metadata: dict[str, Any] = {}

    for key, value in raw.items():
        mapped = field_map.get(key)
        if mapped:
            normalized[mapped] = value
        else:
            metadata[key] = value

    if metadata:
        normalized["metadata"] = metadata

    return normalized


def normalize_event(raw: dict[str, Any], agent_id: str = "pythia-normalizer") -> PythiaEvent:
    """Normalize a raw Pythia event dict into a PythiaEvent.

    Args:
        raw: Raw JSON dict from Pythia API or webhook.
        agent_id: Agent producing this normalization step (for audit).

    Raises:
        ValueError: If required fields cannot be derived.
    """
    raw = dict(raw)  # shallow copy to avoid mutating caller's dict

    # Determine event_id — generate deterministic ID if missing
    event_id = raw.get("event_id") or raw.get("id") or raw.get("eventId")
    if not event_id:
        # Build a seed from title + timestamp for deterministic ID
        title = raw.get("title") or raw.get("msg") or raw.get("message", "")
        ts = raw.get("timestamp") or raw.get("ts", "")
        seed = f"{agent_id}:{title}:{ts}"
        event_id = _generate_id(seed)

    # Map fields
    mapped = _normalize_fields(raw, EVENT_FIELD_MAP)
    mapped.setdefault("event_id", event_id)
    mapped.setdefault("source_agent", raw.get("source_agent", agent_id))
    mapped.setdefault("kind", "generic")  # default kind when not provided

    # Parse timestamp
    if "timestamp" in mapped:
        mapped["timestamp"] = _parse_timestamp(mapped["timestamp"])

    # Normalize severity
    if "severity" in mapped:
        mapped["severity"] = _map_severity(mapped["severity"])

    # Ensure title is present
    if "title" not in mapped or not mapped["title"]:
        kind = mapped.get("kind", "unknown")
        mapped["title"] = f"[Pythia] {kind} event"

    # Ensure body is present
    if "body" not in mapped or not mapped.get("body"):
        body_parts: list[str] = []
        if mapped.get("metadata"):
            body_parts.append(str(mapped["metadata"]))
        if not body_parts:
            body_parts.append("No message body in Pythia event")
        mapped["body"] = " ".join(body_parts)

    # Merge existing metadata with any remaining fields
    existing_meta = mapped.pop("metadata", {})
    if isinstance(existing_meta, dict):
        mapped["metadata"] = {**mapped.get("metadata", {}), **existing_meta}

    try:
        return PythiaEvent.model_validate(mapped)
    except Exception as exc:
        logger.error("Failed to normalize event %s: %s — raw: %s", event_id, exc, raw)
        raise ValueError(f"Event normalization failed for {event_id}: {exc}") from exc


def normalize_forecast(
    raw: dict[str, Any],
    supporting_event_ids: Optional[list[str]] = None,
    agent_id: str = "pythia-normalizer",
) -> PythiaForecast:
    """Normalize a raw Pythia forecast dict into a PythiaForecast.

    Args:
        raw: Raw JSON dict from Pythia API or webhook.
        supporting_event_ids: Pre-computed event IDs to attach as evidence.
        agent_id: Agent producing this normalization step.

    Raises:
        ValueError: If required fields cannot be derived.
    """
    raw = dict(raw)

    # Determine forecast_id
    forecast_id = raw.get("forecast_id") or raw.get("id") or raw.get("forecastId")
    if not forecast_id:
        hypothesis = raw.get("hypothesis") or raw.get("question", "")
        seed = f"{agent_id}:forecast:{hypothesis}"
        forecast_id = _generate_id(seed)

    mapped = _normalize_fields(raw, FORECAST_FIELD_MAP)
    mapped.setdefault("forecast_id", forecast_id)
    mapped.setdefault("agent_id", agent_id)

    # Parse timestamps
    if "created_at" in mapped:
        mapped["created_at"] = _parse_timestamp(mapped["created_at"])
    if mapped.get("resolved_at"):
        mapped["resolved_at"] = _parse_timestamp(mapped["resolved_at"])
    if mapped.get("window_start"):
        mapped["window_start"] = _parse_timestamp(mapped["window_start"])
    if mapped.get("window_end"):
        mapped["window_end"] = _parse_timestamp(mapped["window_end"])

    # Normalize confidence
    raw_conf = mapped.pop("confidence", None)
    conf_enum, conf_numeric = _map_confidence(raw_conf)
    mapped["confidence"] = conf_enum
    if conf_numeric is not None:
        mapped["confidence_numeric"] = conf_numeric

    # Ensure hypothesis and outcome are present
    if not mapped.get("hypothesis"):
        mapped["hypothesis"] = raw.get("prediction", "Unknown prediction")
    if not mapped.get("outcome"):
        mapped["outcome"] = "Pending"

    # Attach supporting events
    if supporting_event_ids:
        mapped["supporting_events"] = supporting_event_ids

    # Collect citations from metadata
    if "metadata" not in mapped:
        mapped["metadata"] = {}

    try:
        return PythiaForecast.model_validate(mapped)
    except Exception as exc:
        logger.error("Failed to normalize forecast %s: %s — raw: %s", forecast_id, exc, raw)
        raise ValueError(f"Forecast normalization failed for {forecast_id}: {exc}") from exc


def normalize_impact(
    raw: dict[str, Any],
    target_id: str,
    target_type: str = "event",
    generated_by: str = "pythia-normalizer",
) -> ImpactAnalysis:
    """Normalize a raw Pythia impact rating into an ImpactAnalysis.

    Args:
        raw: Raw impact dict from Pythia.
        target_id: The event_id or forecast_id this impact refers to.
        target_type: "event" or "forecast".
        generated_by: Agent producing this analysis.
    """
    raw = dict(raw)

    if target_type not in ("event", "forecast"):
        raise ValueError(f"target_type must be 'event' or 'forecast', got: {target_type}")

    # Map impact score
    raw_score = raw.get("score", raw.get("impact_score", raw.get("severity", 0.5)))
    if isinstance(raw_score, str):
        raw_score = _parse_numeric_score(raw_score)
    score = float(raw_score) if raw_score is not None else 0.5
    score = max(0.0, min(1.0, score))

    # Determine tier
    raw_tier = raw.get("tier", raw.get("impact_level", ""))
    if isinstance(raw_tier, str):
        tier_str = raw_tier.upper().strip()
        for t in ImpactTier:
            if t.value.upper() in tier_str:
                tier = t
                break
        else:
            if score >= 0.8:
                tier = ImpactTier.CRITICAL
            elif score >= 0.6:
                tier = ImpactTier.HIGH
            elif score >= 0.3:
                tier = ImpactTier.MEDIUM
            else:
                tier = ImpactTier.LOW
    else:
        if score >= 0.8:
            tier = ImpactTier.CRITICAL
        elif score >= 0.6:
            tier = ImpactTier.HIGH
        elif score >= 0.3:
            tier = ImpactTier.MEDIUM
        else:
            tier = ImpactTier.LOW

    affected = raw.get("affected_agents", raw.get("affected", []))
    if isinstance(affected, str):
        affected = [a.strip() for a in affected.split(",") if a.strip()]
    if not affected:
        affected = [generated_by]

    domains = raw.get("affected_domains", raw.get("domains", []))
    if isinstance(domains, str):
        domains = [d.strip() for d in domains.split(",") if d.strip()]

    rationale = raw.get("rationale", raw.get("reason", "Auto-generated from Pythia impact rating"))
    mitigations = raw.get("mitigations", raw.get("recommendations", []))
    if isinstance(mitigations, str):
        mitigations = [m.strip() for m in mitigations.split("\n") if m.strip()]

    return ImpactAnalysis(
        target_id=target_id,
        target_type=target_type,
        tier=tier,
        score=score,
        affected_agents=affected,
        affected_domains=domains,
        rationale=rationale,
        mitigations=mitigations,
        generated_by=generated_by,
    )


def _parse_numeric_score(raw: str) -> float:
    """Extract numeric portion from strings like 'high (0.85)' or 'score: 0.72'."""
    nums = re.findall(r"[-+]?\d*\.?\d+", raw)
    if nums:
        return float(nums[0])
    if "high" in raw.lower():
        return 0.8
    if "low" in raw.lower():
        return 0.2
    return 0.5
