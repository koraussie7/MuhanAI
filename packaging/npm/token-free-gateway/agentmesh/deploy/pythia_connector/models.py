"""Shared Pydantic schemas for the Pythia Connector."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class EventSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"
    FATAL = "fatal"


class ForecastConfidence(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CERTAIN = "certain"


class ImpactTier(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PythiaEvent(BaseModel):
    event_id: str = Field(..., description="Unique event identifier")
    source_agent: str = Field(..., description="Agent that emitted the event")
    source_run: Optional[str] = None
    timestamp: datetime = Field(default_factory=_utc_now)
    kind: str = Field(..., description="Event type")
    severity: EventSeverity = Field(default=EventSeverity.INFO)
    title: str = Field(..., max_length=256)
    body: str = Field(..., description="Full event body")
    metadata: dict[str, Any] = Field(default_factory=dict)
    cid: Optional[str] = None
    schema_version: str = Field(default="1.0.0")

    model_config = {"extra": "ignore"}

    @field_validator("event_id")
    @classmethod
    def _validate_event_id(cls, v: str) -> str:
        if not v or len(v) < 3:
            raise ValueError("event_id too short")
        return v


class PythiaForecast(BaseModel):
    forecast_id: str = Field(..., description="Unique forecast identifier")
    agent_id: str = Field(..., description="Agent that produced the forecast")
    created_at: datetime = Field(default_factory=_utc_now)
    resolved_at: Optional[datetime] = None
    hypothesis: str = Field(..., description="What is being predicted")
    outcome: str = Field(..., description="The predicted outcome")
    confidence: ForecastConfidence = Field(...)
    confidence_numeric: Optional[float] = Field(None, ge=0.0, le=1.0)
    horizon: Optional[str] = None
    window_start: Optional[datetime] = None
    window_end: Optional[datetime] = None
    supporting_events: list[str] = Field(default_factory=list)
    citations: list[str] = Field(default_factory=list)
    localcrab_claim_id: Optional[str] = None

    model_config = {"extra": "ignore"}

    @model_validator(mode="after")
    def _validate_confidence(self) -> "PythiaForecast":
        if self.confidence_numeric is not None and self.confidence != ForecastConfidence.CERTAIN:
            if self.confidence_numeric >= 0.8:
                self.confidence = ForecastConfidence.HIGH
            elif self.confidence_numeric >= 0.6:
                self.confidence = ForecastConfidence.MEDIUM
            else:
                self.confidence = ForecastConfidence.LOW
        return self


class ImpactAnalysis(BaseModel):
    target_id: str = Field(..., description="PythiaEvent.event_id or PythiaForecast.forecast_id")
    target_type: Literal["event", "forecast"]
    tier: ImpactTier
    score: float = Field(..., ge=0.0, le=1.0)
    affected_agents: list[str] = Field(..., min_length=1)
    affected_domains: list[str] = Field(default_factory=list)
    rationale: str = Field(...)
    mitigations: list[str] = Field(default_factory=list)
    generated_by: str = Field(...)
    generated_at: datetime = Field(default_factory=_utc_now)
    colibri_metrics_ref: Optional[str] = None

    model_config = {"extra": "ignore"}


class CheckpointState(BaseModel):
    last_event_timestamp: Optional[datetime] = None
    last_event_id: Optional[str] = None
    processed_event_ids: set[str] = Field(default_factory=set)
    seen_forecast_ids: set[str] = Field(default_factory=set)
    last_sync_at: datetime = Field(default_factory=_utc_now)
    version: str = "1.0.0"

    model_config = {"extra": "ignore"}


class WebhookPayload(BaseModel):
    event_type: str = Field(..., alias="eventType")
    timestamp: datetime
    source: str
    data: dict[str, Any] = Field(default_factory=dict)
    signature: Optional[str] = None
    nonce: Optional[str] = None

    model_config = {"populate_by_name": True, "extra": "ignore"}