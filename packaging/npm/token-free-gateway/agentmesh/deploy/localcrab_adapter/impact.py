"""Impact adapter — maps Pythia ImpactAnalysis to LocalCrab claim tiers.

LocalCrab claims have a `tier` metadata field that corresponds to
PythiaImpactAnalysis.tier. This module provides conversion and
writes impact annotations onto existing claims.

Maps ImpactTier → LocalCrab claim status + metadata:

  ImpactTier.LOW       → claim metadata tier "low"
  ImpactTier.MEDIUM    → claim metadata tier "medium"
  ImpactTier.HIGH      → claim metadata tier "high"  
  ImpactTier.CRITICAL  → claim metadata tier "critical" + status "disputed"
                         (critical impacts require review)
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from pythia_connector.models import ImpactAnalysis, ImpactTier
from .client import LocalCrabClient
from .mapper import impact_to_claim_metadata, impact_to_graph_edges
from .forecast_ledger import ForecastLedger

logger = logging.getLogger("localcrab_adapter.impact")

# ImpactTier → claim metadata tier
TIER_MAP: dict[ImpactTier, str] = {
    ImpactTier.LOW: "low",
    ImpactTier.MEDIUM: "medium",
    ImpactTier.HIGH: "high",
    ImpactTier.CRITICAL: "critical",
}

# ImpactTier → recommended claim status for critical review
CRITICAL_REVIEW_STATUS = "needs_review"


class ImpactAdapter:
    """Applies Pythia ImpactAnalysis to LocalCrab claims.

    Args:
        client: LocalCrabClient instance.
        ledger: ForecastLedger for forecast→claim lookups.
    """

    def __init__(
        self,
        client: LocalCrabClient,
        ledger: Optional[ForecastLedger] = None,
    ) -> None:
        self.client = client
        self.ledger = ledger

    def apply_impact(
        self,
        impact: ImpactAnalysis,
        claim_id: Optional[str] = None,
    ) -> bool:
        """Apply an ImpactAnalysis to a LocalCrab claim.

        If claim_id is not provided, attempts to resolve it from
        the forecast ledger using impact.target_id.

        Args:
            impact: The ImpactAnalysis to apply.
            claim_id: LocalCrab claim ID. If None, resolves via ledger.

        Returns:
            True if the impact was applied, False if claim not found.
        """
        if not claim_id and self.ledger:
            claim_id = self.ledger.get_claim_id(impact.target_id)

        if not claim_id:
            logger.warning(
                "No LocalCrab claim ID for impact target %s — skipping",
                impact.target_id,
            )
            return False

        # Build impact metadata
        impact_meta = impact_to_claim_metadata(impact)
        tier_str = TIER_MAP.get(impact.tier, "low")

        # Update claim metadata with impact tier
        try:
            self.client.update_claim(
                claim_id=claim_id,
                metadata={
                    "impact_tier": tier_str,
                    "impact_score": impact.score,
                    "affected_agents": impact.affected_agents,
                    "affected_domains": impact.affected_domains,
                    "impact_rationale": impact.rationale,
                    "mitigations": impact.mitigations,
                    "impact_generated_by": impact.generated_by,
                    "impact_generated_at": impact.generated_at.isoformat(),
                },
            )
        except Exception as exc:
            logger.error("Failed to update claim %s with impact: %s", claim_id, exc)
            return False

        # For critical impacts, flag the claim for review
        if impact.tier == ImpactTier.CRITICAL:
            try:
                self.client.update_claim(
                    claim_id=claim_id,
                    status=CRITICAL_REVIEW_STATUS,
                )
            except Exception as exc:
                logger.warning("Failed to flag critical claim %s for review: %s", claim_id, exc)

        # Write graph edges for impact
        edges = impact_to_graph_edges(impact, claim_id)
        for edge in edges:
            try:
                self.client.add_graph_edge(
                    source_id=edge["source_id"],
                    target_id=edge["target_id"],
                    edge_type=edge["edge_type"],
                    weight=edge["weight"],
                    metadata=edge["metadata"],
                )
            except Exception as exc:
                logger.warning("Failed to write impact edge: %s", exc)

        # Store colibri_metrics_ref if set
        if impact.colibri_metrics_ref:
            logger.info(
                "Impact %s linked to Colibri metrics ref %s",
                impact.target_id,
                impact.colibri_metrics_ref[:32],
            )

        logger.info(
            "Applied impact (tier=%s) to claim %s", tier_str, claim_id
        )
        return True

    def impact_score_to_status(self, score: float) -> str:
        """Map an impact score (0–1) to a LocalCrab claim status hint."""
        if score >= 0.8:
            return CRITICAL_REVIEW_STATUS
        if score >= 0.6:
            return "high_priority"
        if score >= 0.3:
            return "monitored"
        return "low_priority"

    def close(self) -> None:
        """Clean up."""
        pass
