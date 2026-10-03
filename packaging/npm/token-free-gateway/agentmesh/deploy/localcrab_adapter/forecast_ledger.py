"""Forecast ledger — tracks Pythia forecasts as LocalCrab claims.

Maintains a bidirectional mapping between PythiaForecast.forecast_id
and LocalCrabClient claim_id, enabling:

  - Creation: PythiaForecast → LocalCrab claim
  - Resolution: When a forecast is resolved, update the claim status
  - Reconciliation: Periodically check for stale/unresolved claims

Bridges to:
  - packages/knowledge-base/src/p2p-memory/ipfs-store.ts (claim state)
  - packages/knowledge-base/src/visuals/colibri-metrics.ts (forecast metrics)
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from pythia_connector.checkpoint import CheckpointStore
from pythia_connector.models import ForecastConfidence, PythiaForecast
from .client import LocalCrabClient
from .mapper import (
    CL_STATUS_PENDING,
    CL_STATUS_REFUTED,
    CL_STATUS_RESOLVED,
    forecast_to_claim,
)

logger = logging.getLogger("localcrab_adapter.forecast_ledger")

DEFAULT_LEDGER_PATH = Path(
    os.environ.get(
        "LOCALCRAB_FORECAST_LEDGER_PATH",
        str(Path(__file__).resolve().parent / ".forecast-ledger.json"),
    )
)


class ForecastLedger:
    """Tracks the PythiaForecast → LocalCrab claim mapping.

    Args:
        client: LocalCrabClient instance.
        checkpoint: Optional CheckpointStore (for persistence).
        ledger_path: File path for the ledger (JSON).
    """

    def __init__(
        self,
        client: LocalCrabClient,
        checkpoint: Optional[CheckpointStore] = None,
        ledger_path: Optional[Path] = None,
    ) -> None:
        self.client = client
        self.checkpoint = checkpoint or CheckpointStore()
        self.ledger_path = ledger_path or DEFAULT_LEDGER_PATH
        self._mapping: dict[str, str] = {}  # pythia_forecast_id → localcrab_claim_id
        self._load()

    def _load(self) -> None:
        """Load ledger from disk if it exists."""
        if not self.ledger_path.exists():
            logger.info("No forecast ledger at %s — starting fresh", self.ledger_path)
            return

        try:
            data = json.loads(self.ledger_path.read_text(encoding="utf-8"))
            self._mapping = data.get("mapping", {})
            logger.info("Loaded forecast ledger: %d entries", len(self._mapping))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Forecast ledger corrupt — starting fresh: %s", exc)

    def _save(self) -> None:
        """Persist ledger to disk atomically."""
        self.ledger_path.parent.mkdir(parents=True, exist_ok=True)
        data = {"mapping": self._mapping, "updated_at": datetime.now(timezone.utc).isoformat()}
        tmp = self.ledger_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(str(tmp), str(self.ledger_path))

    def submit_forecast(
        self,
        forecast: PythiaForecast,
        evidence_ids: Optional[list[str]] = None,
    ) -> str:
        """Submit a forecast as a LocalCrab claim.

        If the forecast was already submitted (by content or by ID),
        returns the existing claim ID without re-submitting.

        Args:
            forecast: The PythiaForecast to submit.
            evidence_ids: Optional list of LocalCrab evidence IDs to link.

        Returns:
            LocalCrab claim ID.
        """
        # Check if already submitted
        existing = self._mapping.get(forecast.forecast_id)
        if existing:
            logger.debug("Forecast %s already has claim %s", forecast.forecast_id, existing)
            return existing

        claim_payload = forecast_to_claim(forecast, evidence_ids=evidence_ids)

        # Check for content-based duplicate
        existing_claim = self._find_by_content(claim_payload["statement"])
        if existing_claim:
            claim_id = existing_claim
            logger.info(
                "Forecast %s matched existing claim %s (content dedup)",
                forecast.forecast_id,
                claim_id,
            )
        else:
            response = self.client.create_claim(
                statement=claim_payload["statement"],
                evidence_ids=claim_payload["evidence_ids"],
                status=claim_payload["status"],
                metadata=claim_payload["metadata"],
            )
            claim_id = response.get("id") or response.get("claim_id", "")
            logger.info(
                "Submitted forecast %s → claim %s", forecast.forecast_id, claim_id
            )

        self._mapping[forecast.forecast_id] = claim_id
        forecast.localcrab_claim_id = claim_id
        self._save()
        self.checkpoint.update_forecast(forecast.forecast_id)
        return claim_id

    def _find_by_content(self, statement: str) -> Optional[str]:
        """Search existing claims for a matching statement."""
        try:
            claims = self.client.list_claims(limit=1000)
            for claim in claims:
                if claim.get("statement") == statement:
                    self_id = claim.get("id") or claim.get("claim_id", "")
                    if self_id:
                        return self_id
        except Exception as exc:
            logger.warning("Claim search failed (continuing): %s", exc)
        return None

    def resolve_forecast(
        self,
        forecast_id: str,
        resolved_outcome: str,
        status: str = CL_STATUS_RESOLVED,
    ) -> bool:
        """Mark a forecast claim as resolved or refuted.

        Args:
            forecast_id: PythiaForecast.forecast_id.
            resolved_outcome: The actual realized outcome.
            status: LocalCrab claim status.

        Returns:
            True if the claim was updated, False if not found.
        """
        claim_id = self._mapping.get(forecast_id)
        if not claim_id:
            logger.warning("Forecast %s not in ledger — cannot resolve", forecast_id)
            return False

        try:
            self.client.update_claim(
                claim_id=claim_id,
                status=status,
                resolved_value=resolved_outcome,
                metadata={
                    "resolved_at": datetime.now(timezone.utc).isoformat(),
                    "resolver": "pythia-connector-forecast-ledger",
                },
            )
            logger.info("Resolved forecast %s → claim %s (status=%s)", forecast_id, claim_id, status)
            return True
        except Exception as exc:
            logger.error("Failed to resolve forecast %s: %s", forecast_id, exc)
            return False

    def reconcile(
        self,
        resolved_forecasts: list[tuple[str, str, ForecastConfidence]],
    ) -> list[str]:
        """Reconcile a batch of resolved forecasts.

        Args:
            resolved_forecasts: List of (forecast_id, actual_outcome, confidence) tuples.

        Returns:
            List of forecast IDs that were successfully reconciled.
        """
        reconciled: list[str] = []
        for forecast_id, outcome, confidence in resolved_forecasts:
            # If confidence was HIGH/CERTAIN and outcome matches prediction, mark resolved
            # If outcome contradicts prediction, mark refuted
            if self.resolve_forecast(forecast_id, outcome, CL_STATUS_RESOLVED):
                reconciled.append(forecast_id)

        if reconciled:
            logger.info("Reconciled %d forecasts: %s", len(reconciled), reconciled[:10])
        return reconciled

    def get_claim_id(self, forecast_id: str) -> Optional[str]:
        """Look up a LocalCrab claim ID by Pythia forecast ID."""
        return self._mapping.get(forecast_id)

    def stats(self) -> dict[str, int]:
        """Return ledger statistics for metrics."""
        return {
            "tracked_forecasts": len(self._mapping),
            "seen_forecasts_checkpoint": len(self.checkpoint.state.seen_forecast_ids),
        }

    def close(self) -> None:
        """Persist any pending state."""
        self._save()
