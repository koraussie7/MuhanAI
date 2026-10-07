"""Content-hash deduplication for Pythia events and forecasts."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Sequence


def content_hash(data: dict[str, Any] | str | bytes) -> str:
    """Compute a deterministic SHA-256 hash of a data object.

    Args:
        data: A dictionary, string, or bytes to hash.

    Returns:
        A 64-character hex string.
    """
    if isinstance(data, dict):
        serialized = json.dumps(data, sort_keys=True, default=str)
        payload = serialized.encode("utf-8")
    elif isinstance(data, str):
        payload = data.encode("utf-8")
    elif isinstance(data, bytes):
        payload = data
    else:
        payload = str(data).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


class Deduper:
    """Tracks seen content hashes to deduplicate events and forecasts.

    Maintains an in-memory set of hashes for O(1) lookup. Persists to
    the checkpoint manager when provided.
    """

    def __init__(self, seen_hashes: set[str] | None = None):
        self._seen: set[str] = seen_hashes or set()

    @property
    def seen_count(self) -> int:
        return len(self._seen)

    def is_duplicate(self, data: dict[str, Any] | str | bytes) -> bool:
        """Check if data has already been seen."""
        h = content_hash(data)
        return h in self._seen

    def add(self, data: dict[str, Any] | str | bytes) -> str:
        """Add data to the dedup set and return its hash."""
        h = content_hash(data)
        self._seen.add(h)
        return h

    def mark_seen(self, data: dict[str, Any] | str | bytes) -> str:
        """Alias for add()."""
        return self.add(data)

    def is_new(self, data: dict[str, Any] | str | bytes) -> bool:
        """Check if data is new (not previously seen), and add it if so.

        Returns True if this is a new item, False if duplicate.
        """
        h = content_hash(data)
        if h in self._seen:
            return False
        self._seen.add(h)
        return True

    def filter_new(self, items: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
        """Filter a sequence of dicts, keeping only new (non-duplicate) items.

        Each item is added to the dedup set as it is encountered.
        """
        new_items: list[dict[str, Any]] = []
        for item in items:
            if self.is_new(item):
                new_items.append(item)
        return new_items

    @property
    def hashes(self) -> set[str]:
        """Return a copy of the set of all seen hashes."""
        return self._seen.copy()

    def merge_hashes(self, other: set[str]) -> None:
        """Merge an external set of hashes into this dedup set."""
        self._seen |= other
