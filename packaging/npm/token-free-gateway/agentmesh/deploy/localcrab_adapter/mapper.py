"""Field mapping: Pythia schemas → LocalCrab evidence/claim format.

This module defines the canonical mapping between the Pythia Connector
schemas (PythiaEvent, PythiaForecast, ImpactAnalysis) and the LocalCrab
evidence/claim/graph structures.

The mappings are intentionally explicit (not auto-reflection-based) so that
schema drift is visible and testable.

Shared schema contract: docs/thin-client/AGENT-WORK-SPLIT.md §6
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from pythia_connector.models import (
    PythiaEvent,
    PythiaForecast,
    ImpactAnalysis,
)
from .client import content_hash

logger = logging.getLogger("localcrab_adapter.mapper")

# LocalCrab claim statuses
CL_STATUS_PENDING = "pending"
CL_STATUS_RESOLVED = "resolved"
CL_STATUS_REFUTED = "refuted"
CL_STATUS_DISPUTED = "disputed"

# Edge types in LocalCrab graph
EDGE_SUPPORTS = "supports"
EDGE_OPPOSES = "opposes"
EDGE_DERIVED_FROM = "derived_from"
EDGE_IMPACTS = "impacts"
EDGE_PREDICTS = "predicts"
EDGE_EVIDENCE = "evidence"


def event_to_evidence(event: PythiaEvent) -> dict[str, Any]:
    """Map a PythiaEvent → LocalCrab evidence dict.

    Returns a dict suitable for LocalCrabClient.create_evidence().
    """
    content = event.body
    cid = content_hash(content)

    evidence = {
        "content": content,
        "source": f"pythia:{event.source_agent}",
        "kind": "research_event",
        "cid": cid,
        "metadata": {
            "event_id": event.event_id,
            "event_kind": event.kind,
            "severity": event.severity.value,
            "timestamp": event.timestamp.isoformat(),
            "source_run": event.source_run or event.source_agent,
            "schema_version": event.schema_version,
        },
    }

    # Merge any existing metadata from the event
    if event.metadata:
        evidence["metadata"].update(event.metadata)

    logger.debug("Mapped event %s → evidence cid=%s", event.event_id, cid[:16])
    return evidence


def forecast_to_claim(
    forecast: PythiaForecast,
    evidence_ids: Optional[list[str]] = None,
) -> dict[str, Any]:
    """Map a PythiaForecast → LocalCrab claim dict.

    Args:
        forecast: The PythiaForecast to map.
        evidence_ids: LocalCrab evidence IDs backing this claim (from
                      PythiaEvent→evidence mapping). If None, the forecast's
                      supporting_events are used as a reference string.
    """
    statement = f"{forecast.hypothesis} → {forecast.outcome}"

    if evidence_ids:
        cl_evidence_ids = evidence_ids
    else:
        cl_evidence_ids = forecast.supporting_events or []

    status = CL_STATUS_RESOLVED if forecast.resolved_at else CL_STATUS_PENDING

    metadata: dict[str, Any] = {
        "forecast_id": forecast.forecast_id,
        "agent_id": forecast.agent_id,
        "confidence": forecast.confidence.value,
        "confidence_numeric": forecast.confidence_numeric,
        "horizon": forecast.horizon,
        "window_start": forecast.window_start.isoformat() if forecast.window_start else None,
        "window_end": forecast.window_end.isoformat() if forecast.window_end else None,
        "created_at": forecast.created_at.isoformat(),
        "resolved_at": forecast.resolved_at.isoformat() if forecast.resolved_at else None,
    }
    if forecast.citations:
        metadata["citations"] = forecast.citations

    claim = {
        "statement": statement,
        "evidence_ids": cl_evidence_ids,
        "status": status,
        "metadata": metadata,
    }

    logger.debug("Mapped forecast %s → claim (%d evidence refs)", forecast.forecast_id, len(cl_evidence_ids))
    return claim


def impact_to_claim_metadata(impact: ImpactAnalysis) -> dict[str, Any]:
    """Map an ImpactAnalysis → LocalCrab claim metadata extension.

    This enriches an existing claim's metadata with impact tier,
    affected agents, and mitigations.
    """
    return {
        "impact_tier": impact.tier.value,
        "impact_score": impact.score,
        "affected_agents": impact.affected_agents,
        "affected_domains": impact.affected_domains,
        "impact_rationale": impact.rationale,
        "mitigations": impact.mitigations,
        "impact_generated_by": impact.generated_by,
        "impact_generated_at": impact.generated_at.isoformat(),
    }


def impact_to_graph_edges(
    impact: ImpactAnalysis,
    claim_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Map an ImpactAnalysis → LocalCrab graph edges.

    Produces edges:
      - IMPACTS: from each affected agent → target
      - EDGE supports/opposes based on tier
    """
    edges: list[dict[str, Any]] = []

    target_ref = claim_id or impact.target_id

    for agent in impact.affected_agents:
        edges.append({
            "source_id": agent,
            "target_id": target_ref,
            "edge_type": EDGE_IMPACTS,
            "weight": impact.score,
            "metadata": {
                "impact_tier": impact.tier.value,
                "rationale": impact.rationale,
            },
        })

    return edges


def build_evidence_chain(
    event: PythiaEvent,
    parent_evidence_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Build a chain of evidence/edges for an event.

    If the event has a parent_event_id, creates a DERIVED_FROM edge
    linking the new evidence to the parent's evidence.

    Returns a list of dicts: first is the evidence payload, rest are edges.
    """
    result: list[dict[str, Any]] = []
    evidence = event_to_evidence(event)
    result.append(evidence)

    if parent_evidence_id or event.parent_event_id:
        parent_ref = parent_evidence_id or event.parent_event_id
        if parent_ref:
            result.append({
                "source_id": evidence["cid"],
                "target_id": parent_ref,
                "edge_type": EDGE_DERIVED_FROM,
                "weight": 1.0,
                "metadata": {
                    "chain_reason": f"Event {event.event_id} derives from {parent_ref}",
                },
            })

    return result


def map_for_localcrab(
    event: Optional[PythiaEvent] = None,
    forecast: Optional[PythiaForecast] = None,
    impact: Optional[ImpactAnalysis] = None,
    evidence_ids: Optional[list[str]] = None,
) -> dict[str, Any]:
    """Convenience: map one or more Pythia objects to LocalCrab payloads.

    Returns a dict with keys: 'evidence', 'claim', 'impact_metadata',
    'graph_edges' — each may be None if not provided.
    """
    result: dict[str, Any] = {
        "evidence": None,
        "claim": None,
        "impact_metadata": None,
        "graph_edges": [],
    }

    if event:
        result["evidence"] = event_to_evidence(event)
        result["graph_edges"].extend(
            e for e in build_evidence_chain(event) if "edge_type" in e
        )

    if forecast:
        result["claim"] = forecast_to_claim(forecast, evidence_ids=evidence_ids)

    if impact:
        result["impact_metadata"] = impact_to_claim_metadata(impact)
        result["graph_edges"].extend(impact_to_graph_edges(impact))

    return result
