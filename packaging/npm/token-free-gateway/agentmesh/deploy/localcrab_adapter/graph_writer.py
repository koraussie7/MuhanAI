"""Graph edge writer for LocalCrab — supports, derived_from, impacts."""

from __future__ import annotations

import logging
from typing import Any

from localcrab_adapter.client import LocalCrabClient

logger = logging.getLogger(__name__)

EDGE_SUPPORTS = "supports"
EDGE_DERIVED_FROM = "derived_from"
EDGE_IMPACTS = "impacts"
EDGE_RELATED_TO = "related_to"
EDGE_CITES = "cites"


class GraphWriter:
    """Writes directed edges to the LocalCrab knowledge graph.

    Common edge types:
      - supports: a piece of evidence supports a claim
      - derived_from: a claim/forecast was derived from an event
      - impacts: an event/forecast impacts another entity
      - related_to: generic relationship
      - cites: a forecast cites an event
    """

    def __init__(self, client: LocalCrabClient):
        self.client = client
        self._edge_count = 0

    def add_edge(
        self,
        source_id: str,
        target_id: str,
        edge_type: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Add a single directed edge."""
        return self.client.add_graph_edge(
            source_id=source_id,
            target_id=target_id,
            edge_type=edge_type,
            metadata=metadata,
        )

    def supports(self, evidence_id: str, claim_id: str, **metadata: Any) -> dict[str, Any]:
        """Record that evidence supports a claim."""
        self._edge_count += 1
        return self.add_edge(evidence_id, claim_id, EDGE_SUPPORTS, dict(metadata))

    def derived_from(self, derived_id: str, source_id: str, **metadata: Any) -> dict[str, Any]:
        """Record that derived_id was derived from source_id."""
        self._edge_count += 1
        return self.add_edge(derived_id, source_id, EDGE_DERIVED_FROM, dict(metadata))

    def impacts(
        self,
        source_id: str,
        target_id: str,
        impact_score: float | None = None,
        **metadata: Any,
    ) -> dict[str, Any]:
        """Record that source_id impacts target_id."""
        self._edge_count += 1
        if impact_score is not None:
            metadata["impactScore"] = impact_score
        return self.add_edge(source_id, target_id, EDGE_IMPACTS, dict(metadata))

    def cites(self, source_id: str, target_id: str, **metadata: Any) -> dict[str, Any]:
        """Record that source_id cites target_id."""
        self._edge_count += 1
        return self.add_edge(source_id, target_id, EDGE_CITES, dict(metadata))

    def related_to(self, source_id: str, target_id: str, **metadata: Any) -> dict[str, Any]:
        """Record a generic bidirectional relationship."""
        self._edge_count += 1
        return self.add_edge(source_id, target_id, EDGE_RELATED_TO, dict(metadata))

    def bulk_edges(self, edges: list[tuple[str, str, str, dict[str, Any] | None]]) -> list[dict[str, Any]]:
        """Add multiple edges in one call.

        Each edge is a tuple of (source_id, target_id, edge_type, metadata).
        """
        results: list[dict[str, Any]] = []
        for source_id, target_id, edge_type, metadata in edges:
            try:
                result = self.add_edge(source_id, target_id, edge_type, metadata)
                results.append(result)
            except Exception as e:
                logger.warning(
                    "Failed to add edge %s -> %s (%s): %s",
                    source_id,
                    target_id,
                    edge_type,
                    e,
                )
                results.append({"error": str(e)})
        return results

    @property
    def edge_count(self) -> int:
        return self._edge_count
