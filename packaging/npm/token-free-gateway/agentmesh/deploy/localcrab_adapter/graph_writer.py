"""Graph writer — writes Pythia-derived relationships to LocalCrab graph.

Creates edges between evidence, claims, and agents in the LocalCrab
graph database. Edge types include:

  - supports:    evidence → claim
  - derived_from: event → parent event
  - impacts:      agent → event/forecast
  - predicts:     claim → forecast outcome
  - evidence:     claim → evidence (reverse of supports)

This maps to the P2PCLAW graph schema where nodes are agents/events/claims
and edges represent causality, support, and prediction relationships.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from pythia_connector.models import PythiaEvent, PythiaForecast, ImpactAnalysis
from .client import LocalCrabClient
from .mapper import (
    EDGE_DERIVED_FROM,
    EDGE_EVIDENCE,
    EDGE_IMPACTS,
    EDGE_OPPOSES,
    EDGE_PREDICTS,
    EDGE_SUPPORTS,
    build_evidence_chain,
    impact_to_graph_edges,
)

logger = logging.getLogger("localcrab_adapter.graph_writer")


class GraphWriter:
    """Writes P2P-derived graph structure to LocalCrab.

    Args:
        client: LocalCrabClient instance.
    """

    def __init__(self, client: LocalCrabClient) -> None:
        self.client = client
        self._edges_written: int = 0
        self._nodes_written: int = 0

    def write_evidence_chain(
        self,
        event: PythiaEvent,
        evidence_cid: Optional[str] = None,
    ) -> list[str]:
        """Write evidence node + DERIVED_FROM edges for an event.

        Args:
            event: The PythiaEvent.
            evidence_cid: Optional LocalCrab evidence CID to link from.
                          If None, a node is created from the event.

        Returns: List of created node IDs.
        """
        chain = build_evidence_chain(event)
        node_ids: list[str] = []

        for item in chain:
            if "edge_type" in item:
                # It's an edge
                self.client.add_graph_edge(
                    source_id=item["source_id"],
                    target_id=item["target_id"],
                    edge_type=item["edge_type"],
                    weight=item.get("weight", 1.0),
                    metadata=item.get("metadata"),
                )
                self._edges_written += 1
            else:
                # It's an evidence payload — create a node
                node_id = self._create_evidence_node(item, evidence_cid)
                node_ids.append(node_id)

        return node_ids

    def _create_evidence_node(
        self, evidence_payload: dict[str, Any], link_cid: Optional[str]
    ) -> str:
        """Create a graph node from an evidence payload."""
        node_id = link_cid or evidence_payload.get("cid", f"evt-{id(evidence_payload)}")
        label = evidence_payload.get("metadata", {}).get("event_kind", "event")

        node = self.client.add_graph_node(
            node_id=node_id,
            node_type="pythia_event",
            label=label,
            metadata={
                "source_agent": evidence_payload.get("source", ""),
                "severity": evidence_payload.get("metadata", {}).get("severity", "info"),
                "created": evidence_payload.get("metadata", {}).get("timestamp"),
            },
        )
        self._nodes_written += 1
        return node_id or str(node.get("id", ""))

    def link_evidence_to_claim(
        self,
        evidence_id: str,
        claim_id: str,
        supports: bool = True,
    ) -> None:
        """Create a SUPPORTS or OPPOSES edge between evidence and claim."""
        edge_type = EDGE_SUPPORTS if supports else EDGE_OPPOSES
        self.client.add_graph_edge(
            source_id=evidence_id,
            target_id=claim_id,
            edge_type=edge_type,
            weight=1.0 if supports else -1.0,
            metadata={
                "source": "pythia-connector",
                "relation": "evidence_to_claim",
            },
        )
        self._edges_written += 1
        logger.debug("Linked evidence %s → claim %s (%s)", evidence_id, claim_id, edge_type)

    def write_impact_edges(
        self,
        impact: ImpactAnalysis,
        claim_id: Optional[str] = None,
    ) -> list[str]:
        """Write IMPACTS edges from affected agents to the target."""
        edges = impact_to_graph_edges(impact, claim_id)
        node_ids: list[str] = []

        for edge in edges:
            resp = self.client.add_graph_edge(
                source_id=edge["source_id"],
                target_id=edge["target_id"],
                edge_type=edge["edge_type"],
                weight=edge.get("weight", 1.0),
                metadata=edge.get("metadata"),
            )
            self._edges_written += 1
            node_ids.append(edge["target_id"])

        return node_ids

    def write_forecast_prediction(
        self,
        forecast: PythiaForecast,
        claim_id: str,
    ) -> None:
        """Link a forecast claim to its predicted outcome via PREDICTS edge."""
        # Create a node for the prediction outcome
        outcome_node_id = f"forecast:{forecast.forecast_id}:outcome"
        self.client.add_graph_node(
            node_id=outcome_node_id,
            node_type="prediction_outcome",
            label=forecast.outcome[:100],
            metadata={
                "forecast_id": forecast.forecast_id,
                "confidence": forecast.confidence.value,
                "confidence_numeric": forecast.confidence_numeric,
                "horizon": forecast.horizon,
                "resolved": forecast.resolved_at is not None,
            },
        )
        self._nodes_written += 1

        # PREDICTS edge: claim → outcome
        self.client.add_graph_edge(
            source_id=claim_id,
            target_id=outcome_node_id,
            edge_type=EDGE_PREDICTS,
            weight=1.0,
            metadata={
                "confidence": forecast.confidence.value,
                "predicted_at": forecast.created_at.isoformat(),
            },
        )
        self._edges_written += 1

        # Reverse EVIDENCE edge: outcome → claim (for traversal)
        self.client.add_graph_edge(
            source_id=outcome_node_id,
            target_id=claim_id,
            edge_type=EDGE_EVIDENCE,
            weight=1.0,
            metadata={"relation": "outcome_evidence"},
        )
        self._edges_written += 1

        logger.debug(
            "Wrote forecast prediction graph for %s → claim %s",
            forecast.forecast_id,
            claim_id,
        )

    def stats(self) -> dict[str, int]:
        """Return graph writer statistics for metrics."""
        return {
            "edges_written": self._edges_written,
            "nodes_written": self._nodes_written,
        }

    def close(self) -> None:
        """Flush any pending operations."""
        pass
