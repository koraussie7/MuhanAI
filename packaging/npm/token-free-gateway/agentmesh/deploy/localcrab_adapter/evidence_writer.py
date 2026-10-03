"""Evidence writer — submits Pythia events as LocalCrab evidence.

Handles content-hash deduplication (via client.content_hash) and
batch submission for efficiency. Tracks submitted evidence IDs in
a local cache to avoid redundant API calls.

Bridges to:
  - packages/knowledge-base/src/p2p-memory/ipfs-store.ts (IPFS CID tracking)
  - packages/knowledge-base/src/p2p-memory/memwal-bridge.ts (WAL persistence)
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

from pythia_connector.checkpoint import CheckpointStore
from pythia_connector.models import PythiaEvent
from .client import LocalCrabClient, content_hash
from .mapper import event_to_evidence

logger = logging.getLogger("localcrab_adapter.evidence_writer")

# Batch size for evidence submission
EVIDENCE_BATCH_SIZE = int(os.environ.get("LOCALCRAB_EVIDENCE_BATCH_SIZE", "50"))


class EvidenceWriter:
    """Writes PythiaEvent records to LocalCrab as evidence.

    Uses content-hash-based dedup so the same event received from
    multiple P2PCLAW peers is only submitted once.

    Args:
        client: LocalCrabClient instance.
        checkpoint: Optional CheckpointStore for tracking submitted hashes.
        batch_size: Max events to buffer before flushing.
    """

    def __init__(
        self,
        client: LocalCrabClient,
        checkpoint: Optional[CheckpointStore] = None,
        batch_size: int = EVIDENCE_BATCH_SIZE,
    ) -> None:
        self.client = client
        self.checkpoint = checkpoint or CheckpointStore()
        self._batch: list[dict[str, Any]] = []
        self._submitted_hashes: set[str] = set()
        self.batch_size = batch_size

    def write_event(self, event: PythiaEvent) -> Optional[str]:
        """Submit a single PythiaEvent as evidence.

        Returns the LocalCrab evidence CID if created, None if duplicate.
        """
        evidence_payload = event_to_evidence(event)
        cid = evidence_payload["cid"]

        if cid in self._submitted_hashes or self._is_submitted(cid):
            logger.debug("Evidence already submitted (cid=%s)", cid[:16])
            return None

        response = self.client.create_evidence(
            content=evidence_payload["content"],
            source=evidence_payload["source"],
            kind=evidence_payload["kind"],
            cid=cid,
            metadata=evidence_payload["metadata"],
        )

        self._submitted_hashes.add(cid)
        self._mark_submitted(cid)

        evidence_id = response.get("id") or response.get("cid") or cid
        logger.info(
            "Submitted evidence for event %s → %s", event.event_id, evidence_id
        )
        return evidence_id

    def write_events_batch(self, events: list[PythiaEvent]) -> list[str]:
        """Batch submit multiple events. Returns list of evidence IDs created."""
        results: list[str] = []
        for event in events:
            eid = self.write_event(event)
            if eid:
                results.append(eid)
            self._check_flush()

        # Flush remaining
        self.flush()
        return results

    def flush(self) -> None:
        """Flush any buffered evidence (no-op for current impl — submitted inline)."""
        self._batch.clear()

    def _is_submitted(self, cid: str) -> bool:
        """Check if evidence with this CID was already submitted (checkpoint)."""
        try:
            return cid in self.checkpoint.state.processed_event_ids
        except Exception:
            return False

    def _mark_submitted(self, cid: str) -> None:
        """Record a submitted evidence CID in checkpoint."""
        self.checkpoint.state.processed_event_ids.add(cid)
        try:
            self.checkpoint.save()
        except Exception as exc:
            logger.warning("Checkpoint save failed after evidence submit: %s", exc)

    def stats(self) -> dict[str, int]:
        """Return evidence writer statistics for metrics."""
        return {
            "submitted_memory": len(self._submitted_hashes),
            "submitted_checkpoint": len(self.checkpoint.state.processed_event_ids),
            "batch_pending": len(self._batch),
            "batch_size": self.batch_size,
        }

    def close(self) -> None:
        """Flush and close."""
        self.flush()
