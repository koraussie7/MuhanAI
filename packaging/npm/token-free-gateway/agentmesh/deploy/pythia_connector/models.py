"""Shared Pydantic schemas for the Pythia Connector.

These schemas form the contract between Part 1 (Pythia Connector),
Part 2 (LocalCrab Adapter), and Part 3 (MuhanAI Dashboard integration).

They mirror the TypeScript interfaces in:
  packages/knowledge-base/src/visuals/colibri-metrics.ts

Schema versions follow semantic versioning for backward compatibility
with the 14-agent P2PCLAW collective.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class EventSeverity(str, Enum):
    """Severity levels aligned with LocalCrab evidence grading."""

    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"
    FATAL = "fatal"


class ForecastConfidence(str, Enum):
    """Confidence bucket for probabilistic forecasts."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CERTAIN = "certain"


class ImpactTier(str, Enum):
    """Impact tier matching ColibriMetrics p2p tiers."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PythiaEvent(BaseModel):
    """A single research event emitted by Pythia.

    This is the atomic unit flowing through the P2P network.
    Each event is produced by one of the 14 P2PCLAW agents.
    """

    event_id: str = Field(..., description="Unique event identifier (UUIDv7)")
    source_agent: str = Field(..., description="Agent that emitted the event (e.g. 'claude-thin-client')")
    source_run: Optional[str] = Field(None, description="Run/session identifier for traceability")
    timestamp: datetime = Field(default_factory=_utc_now)
    kind: str = Field(..., description="Event type (e.g. 'model_update', 'evidence', 'prediction')")
    severity: EventSeverity = Field(default=EventSeverity.INFO)
    title: str = Field(..., max_length=256)
    body: str = Field(..., description="Full event body / summary")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Arbitrary agent-specific metadata")

    # Cross-system identifiers
    pythia_external_id: Optional[str] = Field(None, description="ID from Pythia upstream system")
    parent_event_id: Optional[str] = Field(None, description="Links to a parent event for traceability")

    # P2P distribution metadata
    cid: Optional[str] = Field(None, description="IPFS CID when pinned to P2P network")
    schema_version: str = Field(default="1.0.0")

    model_config = {
        "extra": "ignore",  # tolerate future Pythia schema additions
        "json_schema_extra": {
            "x-colibri-bridge": "PythiaEvent -> ColibriMetricsPeerMetrics via p2p-stream",
        },
    }

    @field_validator("event_id")
    @classmethod
    def _validate_event_id(cls, v: str) -> str:
        if not v or len(v) < 3:
            raise ValueError("event_id too short")
        return v

    @model_validator(mode="after")
    def _check_consistency(self) -> "PythiaEvent":
        if self.parent_event_id and self.parent_event_id == self.event_id:
            raise ValueError("parent_event_id cannot equal event_id")
        return self


class PythiaForecast(BaseModel):
    """A forecast / prediction emitted by an agent via Pythia.

    Maps to LocalCrab claim + evidence pattern where:
      - claim = forecast.hypothesis + forecast.outcome
      - evidence = supporting PythiaEvents passed via event_ids
    """

    forecast_id: str = Field(..., description="Unique forecast identifier (UUIDv7)")
    agent_id: str = Field(..., description="Agent that produced the forecast")
    created_at: datetime = Field(default_factory=_utc_now)
    resolved_at: Optional[datetime] = Field(None, description="When outcome was verified")

    hypothesis: str = Field(..., description="What is being predicted")
    outcome: str = Field(..., description="The predicted outcome / value")
    confidence: ForecastConfidence = Field(..., description="Confidence bucket")
    confidence_numeric: Optional[float] = Field(None, ge=0.0, le=1.0)

    horizon: Optional[str] = Field(None, description="Time horizon (e.g. '7d', '30d')")
    window_start: Optional[datetime] = None
    window_end: Optional[datetime] = None

    supporting_events: list[str] = Field(default_factory=list, description="PythiaEvent.event_id refs")
    citations: list[str] = Field(default_factory=list, description="External citation links / CIDs")

    # LocalCrab mapping
    localcrab_claim_id: Optional[str] = None
    localcrab_evidence_id: Optional[str] = None

    model_config = {
        "extra": "ignore",
    }

    @model_validator(mode="after")
    def _validate_confidence(self) -> "PythiaForecast":
        if self.confidence == ForecastConfidence.CERTAIN and self.confidence_numeric != 1.0:
            raise ValueError("CERTAIN confidence requires confidence_numeric == 1.0")
        if self.confidence_numeric is not None and self.confidence != ForecastConfidence.CERTAIN:
            if self.confidence_numeric >= 0.8:
                self.confidence = ForecastConfidence.HIGH
            elif self.confidence_numeric >= 0.6:
                self.confidence = ForecastConfidence.MEDIUM
            else:
                self.confidence = ForecastConfidence.LOW
        return self


class ImpactAnalysis(BaseModel):
    """Impact analysis for a forecast or event.

    Bridges to ColibriMetricsPeerMetrics for dashboard visualization.
    """

    target_id: str = Field(..., description="PythiaEvent.event_id or PythiaForecast.forecast_id")
    target_type: Literal["event", "forecast"]
    tier: ImpactTier
    score: float = Field(..., ge=0.0, le=1.0, description="Normalized impact score 0–1")
    affected_agents: list[str] = Field(..., min_length=1)
    affected_domains: list[str] = Field(default_factory=list)

    rationale: str = Field(..., description="Why this impact tier was assigned")
    mitigations: list[str] = Field(default_factory=list)

    generated_by: str = Field(..., description="Agent that produced this analysis")
    generated_at: datetime = Field(default_factory=_utc_now)

    # Colibri metrics bridge
    colibri_metrics_ref: Optional[str] = None

    model_config = {
        "extra": "ignore",
    }


class CheckpointState(BaseModel):
    """Resume-after state persisted on disk."""

    last_event_timestamp: Optional[datetime] = None
    last_event_id: Optional[str] = None
    processed_event_ids: set[str] = Field(default_factory=set)
    seen_forecast_ids: set[str] = Field(default_factory=set)
    last_sync_at: datetime = Field(default_factory=_utc_now)
    version: str = "1.0.0"

    model_config = {
        "extra": "ignore",
        "ser_json_timedelta": "float",
    }


class WebhookPayload(BaseModel):
    """Incoming Pythia webhook payload envelope."""

    event_type: str = Field(..., alias="eventType")
    timestamp: datetime
    source: str
    data: dict[str, Any] = Field(default_factory=dict)
    signature: Optional[str] = Field(None, description="HMAC-SHA256 signature if Pythia signing configured")
    nonce: Optional[str] = None

    model_config = {
        "populate_by_name": True,
        "extra": "ignore",
    }
