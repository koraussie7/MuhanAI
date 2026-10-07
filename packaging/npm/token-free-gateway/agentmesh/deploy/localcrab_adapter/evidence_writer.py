"""Batched evidence submission to LocalCrab."""

from __future__ import annotations

import logging
from collections import deque
from typing import Any

from pythia_connector.models import PythiaEvent, PythiaForecast
from localcrab_adapter.mapper import map_event_to_evidence, map_forecast_to_evidence
from localcrab_adapter.client import LocalCrabClient

logger = logging.getLogger(__name__)


class EvidenceWriter:
    """Buffers evidence items and submits them in batches to LocalCrab.

    Usage:
        writer = EvidenceWriter(client)
        writer.write_event(event)  # buffered
        writer.flush()  # submit all buffered items
    """

    def __init__(self, client: LocalCrabClient, batch_size: int = 10):
        self.client = client
        self.batch_size = batch_size
        self._buffer: deque[dict[str, Any]] = deque()
        self._written_count = 0
        self._flushed_count = 0

    def write_event(self, event: PythiaEvent) -> str | None:
        """Buffer evidence from a PythiaEvent; flush if batch is full.

        Returns the LocalCrab evidence ID if a flush occurred, None otherwise.
        """
        evidence = map_event_to_evidence(event)
        self._buffer.append(evidence)
        self._written_count += 1

        if len(self._buffer) >= self.batch_size:
            return self.flush()
        return None

    def write_forecast(self, forecast: PythiaForecast) -> str | None:
        """Buffer evidence from a PythiaForecast; flush if batch is full."""
        evidence = map_forecast_to_evidence(forecast)
        self._buffer.append(evidence)
        self._written_count += 1

        if len(self._buffer) >= self.batch_size:
            return self.flush()
        return None

    def write_raw(self, evidence: dict[str, Any]) -> str | None:
        """Buffer a raw evidence dict; flush if batch is full."""
        self._buffer.append(evidence)
        self._written_count += 1

        if len(self._buffer) >= self.batch_size:
            return self.flush()
        return None

    def flush(self) -> dict[str, Any] | None:
        """Submit all buffered evidence items to LocalCrab.

        Returns the API response, or None if buffer is empty.
        """
        if not self._buffer:
            return None

        items = list(self._buffer)
        self._buffer.clear()

        try:
            response = self.client.batch_submit_evidence(items)
            self._flushed_count += len(items)
            logger.info("Flushed %d evidence items to LocalCrab", len(items))
            return response
        except Exception as e:
            logger.error("Failed to flush evidence batch: %s", e)
            # Re-queue items for retry on next flush
            self._buffer.extend(items)
            raise

    @property
    def buffer_size(self) -> int:
        return len(self._buffer)

    @property
    def written_count(self) -> int:
        return self._written_count

    @property
    def flushed_count(self) -> int:
        return self._flushed_count

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._buffer:
            try:
                self.flush()
            except Exception as e:
                logger.error("Error during final flush: %s", e)
