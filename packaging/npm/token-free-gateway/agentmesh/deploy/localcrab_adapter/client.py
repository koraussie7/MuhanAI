"""LocalCrab API client.

LocalCrab is the evidence/claim/graph storage backend. This client
provides CRUD operations over its HTTP API, with retry and
content-hash-based deduplication consistent with the P2PCLAW pattern.

API endpoints (LocalCrab v1):
  POST   /v1/evidence    — create evidence
  GET    /v1/evidence    — list evidence (filter by source, cid)
  GET    /v1/evidence/{id} — get single evidence
  POST   /v1/claims      — create claim
  PUT    /v1/claims/{id} — update claim
  GET    /v1/claims      — list claims
  POST   /v1/graph/edge  — add edge to evidence/claim graph
  POST   /v1/graph/node  — add standalone node
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urljoin

import requests

logger = logging.getLogger("localcrab_adapter.client")

LOCALCRAB_BASE_URL = os.environ.get(
    "LOCALCRAB_API_URL", "https://localcrab.muhanai.com/api"
)
LOCALCRAB_API_KEY = os.environ.get("LOCALCRAB_API_KEY", "")
LOCALCRAB_TIMEOUT = float(os.environ.get("LOCALCRAB_TIMEOUT", "30"))
LOCALCRAB_RETRY_COUNT = int(os.environ.get("LOCALCRAB_RETRY_COUNT", "3"))
LOCALCRAB_RETRY_DELAY = float(os.environ.get("LOCALCRAB_RETRY_DELAY", "1.0"))


def load_env(env_path: Optional[Path] = None) -> dict[str, str]:
    """Load .env if present (mirrors pythia_connector.client pattern)."""
    if env_path is None:
        env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    env: dict[str, str] = {}
    if env_path and env_path.exists():
        logger.info("Loading .env from %s", env_path)
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                key, _, value = line.partition("=")
                env[key.strip()] = value.strip()
                os.environ.setdefault(key.strip(), value.strip())
    return env


class LocalCrabClient:
    """HTTP client for the LocalCrab evidence/claim/graph API."""

    def __init__(
        self,
        base_url: str = LOCALCRAB_BASE_URL,
        api_key: str = LOCALCRAB_API_KEY,
        timeout: float = LOCALCRAB_TIMEOUT,
        session: Optional[requests.Session] = None,
    ) -> None:
        self.base_url = base_url.rstrip("/") + "/"
        self.api_key = api_key
        self.timeout = timeout
        self._session = session or requests.Session()
        self._session.headers.update(
            {
                "Accept": "application/json",
                "Content-Type": "application/json",
            }
        )
        if api_key:
            self._session.headers["X-API-Key"] = api_key

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        """Core request with retry on transient errors."""
        url = urljoin(self.base_url, path.lstrip("/"))
        kwargs.setdefault("timeout", self.timeout)

        last_exc: Optional[Exception] = None
        for attempt in range(1, LOCALCRAB_RETRY_COUNT + 1):
            try:
                resp = self._session.request(method, url, **kwargs)
                resp.raise_for_status()
                if resp.headers.get("Content-Type", "").startswith("application/json"):
                    return resp.json()
                return resp.text
            except requests.RequestException as exc:
                last_exc = exc
                if attempt < LOCALCRAB_RETRY_COUNT:
                    delay = LOCALCRAB_RETRY_DELAY * (2 ** (attempt - 1))
                    logger.warning(
                        "LocalCrab %s %s attempt %d/%d failed: %s — retrying in %.1fs",
                        method, url, attempt, LOCALCRAB_RETRY_COUNT, exc, delay,
                    )
                    time.sleep(delay)
        raise last_exc  # type: ignore[misc]

    def create_evidence(
        self,
        content: str,
        source: str,
        kind: str = "text",
        cid: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Create an evidence entry in LocalCrab."""
        payload = {
            "content": content,
            "source": source,
            "kind": kind,
        }
        if cid:
            payload["cid"] = cid
        if metadata:
            payload["metadata"] = metadata

        return self._request("POST", "/v1/evidence", json=payload)

    def get_evidence(self, evidence_id: str) -> dict[str, Any]:
        """Fetch a single evidence entry by ID."""
        return self._request("GET", f"/v1/evidence/{evidence_id}")

    def list_evidence(
        self,
        source: Optional[str] = None,
        cid: Optional[str] = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """List evidence entries, optionally filtered."""
        params: dict[str, Any] = {"limit": limit}
        if source:
            params["source"] = source
        if cid:
            params["cid"] = cid

        raw = self._request("GET", "/v1/evidence", params=params)
        if isinstance(raw, dict) and "evidence" in raw:
            return raw["evidence"]
        return raw if isinstance(raw, list) else []

    def create_claim(
        self,
        statement: str,
        evidence_ids: list[str],
        status: str = "pending",
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Create a claim in LocalCrab, backed by evidence IDs."""
        payload = {
            "statement": statement,
            "evidence_ids": evidence_ids,
            "status": status,
        }
        if metadata:
            payload["metadata"] = metadata

        return self._request("POST", "/v1/claims", json=payload)

    def update_claim(
        self,
        claim_id: str,
        status: Optional[str] = None,
        resolved_value: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Update an existing claim (e.g., mark resolved)."""
        payload: dict[str, Any] = {}
        if status:
            payload["status"] = status
        if resolved_value is not None:
            payload["resolved_value"] = resolved_value
        if metadata:
            payload["metadata"] = metadata

        return self._request("PUT", f"/v1/claims/{claim_id}", json=payload)

    def list_claims(
        self,
        status: Optional[str] = None,
        agent_id: Optional[str] = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """List claims, optionally filtered."""
        params: dict[str, Any] = {"limit": limit}
        if status:
            params["status"] = status
        if agent_id:
            params["agent_id"] = agent_id

        raw = self._request("GET", "/v1/claims", params=params)
        if isinstance(raw, dict) and "claims" in raw:
            return raw["claims"]
        return raw if isinstance(raw, list) else []

    def add_graph_edge(
        self,
        source_id: str,
        target_id: str,
        edge_type: str,
        weight: float = 1.0,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Add an edge to the LocalCrab graph."""
        payload = {
            "source_id": source_id,
            "target_id": target_id,
            "edge_type": edge_type,
            "weight": weight,
        }
        if metadata:
            payload["metadata"] = metadata

        return self._request("POST", "/v1/graph/edge", json=payload)

    def add_graph_node(
        self,
        node_id: str,
        node_type: str,
        label: str,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Add a standalone node to the LocalCrab graph."""
        payload = {
            "node_id": node_id,
            "node_type": node_type,
            "label": label,
        }
        if metadata:
            payload["metadata"] = metadata

        return self._request("POST", "/v1/graph/node", json=payload)

    def health_check(self) -> dict[str, Any]:
        """Health check for LocalCrab API."""
        return self._request("GET", "/v1/health")

    def close(self) -> None:
        self._session.close()

    def __enter__(self) -> "LocalCrabClient":
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.close()


# Content-hash helper (mirrors pythia_connector.dedupe pattern)
def content_hash(text: str, salt: str = "") -> str:
    """Compute a content hash for dedup of evidence/claim content.

    Uses SHA-256 with optional salt for uniqueness across agent instances.
    """
    h = hashlib.sha256()
    if salt:
        h.update(salt.encode("utf-8"))
    h.update(text.encode("utf-8"))
    return h.hexdigest()[:32]
