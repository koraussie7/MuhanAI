"""HTTP client for the LocalCrab API."""

from __future__ import annotations

import os
from typing import Any

import requests

from pythia_connector.retry import with_retry

DEFAULT_URL = "http://localhost:8090"


class LocalCrabClient:
    """HTTP client for the LocalCrab knowledge graph API.

    Configuration via environment variables:
      LOCALCRAB_API_URL   — base URL (default: http://localhost:8090)
      LOCALCRAB_API_KEY   — bearer token
      LOCALCRAB_TIMEOUT   — request timeout in seconds (default: 30)
    """

    def __init__(
        self,
        api_url: str | None = None,
        api_key: str | None = None,
        timeout: float | None = None,
    ):
        self.api_url = (api_url or os.environ.get("LOCALCRAB_API_URL", DEFAULT_URL)).rstrip("/")
        self.api_key = api_key or os.environ.get("LOCALCRAB_API_KEY")
        self.timeout = timeout or float(os.environ.get("LOCALCRAB_TIMEOUT", "30"))
        self._session = requests.Session()
        if self.api_key:
            self._session.headers.update({"Authorization": f"Bearer {self.api_key}"})

    @with_retry(max_attempts=3)
    def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        url = f"{self.api_url}{path}"
        kwargs.setdefault("timeout", self.timeout)
        response = self._session.request(method, url, **kwargs)
        response.raise_for_status()
        if response.content:
            return response.json()
        return {}

    def submit_evidence(
        self,
        event_id: str,
        evidence_type: str,
        content: str,
        metadata: dict[str, Any] | None = None,
        source_agent: str | None = None,
    ) -> dict[str, Any]:
        """Submit a piece of evidence to LocalCrab."""
        body = {
            "eventId": event_id,
            "type": evidence_type,
            "content": content,
        }
        if metadata:
            body["metadata"] = metadata
        if source_agent:
            body["sourceAgent"] = source_agent
        return self._request("POST", "/evidence", json=body)

    def batch_submit_evidence(self, evidence_items: list[dict[str, Any]]) -> dict[str, Any]:
        """Submit multiple evidence items in a single batch."""
        return self._request("POST", "/evidence/batch", json={"items": evidence_items})

    def create_claim(
        self,
        claim_type: str,
        statement: str,
        evidence_id: str | None = None,
        confidence: float | None = 0.5,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Create a new claim in LocalCrab."""
        body = {
            "type": claim_type,
            "statement": statement,
            "confidence": confidence,
        }
        if evidence_id:
            body["evidenceId"] = evidence_id
        if metadata:
            body["metadata"] = metadata
        return self._request("POST", "/claims", json=body)

    def create_claim_with_evidence(
        self,
        claim_type: str,
        statement: str,
        content: str,
        evidence_type: str,
        confidence: float = 0.5,
        event_id: str | None = None,
        source_agent: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Create an evidence item and a claim in one call."""
        evidence = self.submit_evidence(
            event_id=event_id or "unknown",
            evidence_type=evidence_type,
            content=content,
            source_agent=source_agent,
        )
        claim = self.create_claim(
            claim_type=claim_type,
            statement=statement,
            evidence_id=evidence.get("id"),
            confidence=confidence,
            metadata=metadata,
        )
        return {"evidence": evidence, "claim": claim}

    def add_graph_edge(
        self,
        source_id: str,
        target_id: str,
        edge_type: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Add a directed edge to the graph."""
        body = {
            "sourceId": source_id,
            "targetId": target_id,
            "type": edge_type,
        }
        if metadata:
            body["metadata"] = metadata
        return self._request("POST", "/graph/edges", json=body)

    def get_claim(self, claim_id: str) -> dict[str, Any]:
        """Retrieve a claim by ID."""
        return self._request("GET", f"/claims/{claim_id}")

    def get_evidence(self, evidence_id: str) -> dict[str, Any]:
        """Retrieve evidence by ID."""
        return self._request("GET", f"/evidence/{evidence_id}")

    def get_forecast_claim(self, forecast_id: str) -> dict[str, Any]:
        """Look up the LocalCrab claim associated with a Pythia forecast."""
        return self._request("GET", f"/claims/by-forecast/{forecast_id}")

    def health(self) -> dict[str, Any]:
        return self._request("GET", "/health")

    def close(self) -> None:
        self._session.close()
