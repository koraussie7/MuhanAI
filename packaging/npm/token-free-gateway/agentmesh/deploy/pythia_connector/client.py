"""HTTP client for the Pythia API with env-based configuration and retries."""

from __future__ import annotations

import logging
import os
from typing import Any

import requests
from requests.adapters import HTTPAdapter

from pythia_connector.normalizer import normalize_event, normalize_forecast
from pythia_connector.retry import with_retry
from pythia_connector.models import PythiaEvent, PythiaForecast

logger = logging.getLogger(__name__)


class PythiaClient:
    """HTTP client for the Pythia AI research event/forecast API.

    Configuration is driven by environment variables:
      PYTHIA_API_URL   — base URL (default: http://localhost:3002)
      PYTHIA_API_KEY   — bearer token for authentication
      PYTHIA_TIMEOUT   — request timeout in seconds (default: 30)
    """

    def __init__(
        self,
        api_url: str | None = None,
        api_key: str | None = None,
        timeout: float | None = None,
    ):
        self.api_url = (api_url or os.environ.get("PYTHIA_API_URL", "http://localhost:3002")).rstrip("/")
        self.api_key = api_key or os.environ.get("PYTHIA_API_KEY")
        self.timeout = timeout or float(os.environ.get("PYTHIA_TIMEOUT", "30"))
        self._session = requests.Session()
        adapter = HTTPAdapter(pool_connections=10, pool_maxsize=10)
        self._session.mount("http://", adapter)
        self._session.mount("https://", adapter)
        if self.api_key:
            self._session.headers.update({"Authorization": f"Bearer {self.api_key}"})

    @property
    def base_url(self) -> str:
        return self.api_url

    @with_retry(max_attempts=3)
    def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        """Perform an HTTP request with retry logic."""
        url = f"{self.api_url}{path}"
        kwargs.setdefault("timeout", self.timeout)
        response = self._session.request(method, url, **kwargs)
        response.raise_for_status()
        if response.content:
            return response.json()
        return {}

    def get_events(
        self,
        limit: int = 100,
        after: str | None = None,
        agent_id: str | None = None,
        kind: str | None = None,
    ) -> list[PythiaEvent]:
        """Fetch events from the Pythia API, optionally filtered.

        Args:
            limit: Maximum number of events to return.
            after: Fetch events after this event ID (cursor-based pagination).
            agent_id: Filter by source agent ID.
            kind: Filter by event kind.

        Returns:
            A list of PythiaEvent objects.
        """
        params: dict[str, Any] = {"limit": limit}
        if after:
            params["after"] = after
        if agent_id:
            params["agent_id"] = agent_id
        if kind:
            params["kind"] = kind

        data = self._request("GET", "/api/events", params=params)
        raw_events = data.get("events", data if isinstance(data, list) else [])
        events: list[PythiaEvent] = []
        for raw in raw_events:
            try:
                events.append(normalize_event(raw))
            except Exception as e:
                logger.warning("Skipping malformed event: %s", e)
        return events

    def get_event(self, event_id: str) -> PythiaEvent | None:
        """Fetch a single event by ID."""
        try:
            data = self._request("GET", f"/api/events/{event_id}")
            return normalize_event(data)
        except requests.HTTPError as e:
            if e.response.status_code == 404:
                return None
            raise

    def get_forecasts(
        self,
        limit: int = 100,
        agent_id: str | None = None,
        resolved: bool | None = None,
    ) -> list[PythiaForecast]:
        """Fetch forecasts from the Pythia API."""
        params: dict[str, Any] = {"limit": limit}
        if agent_id:
            params["agent_id"] = agent_id
        if resolved is not None:
            params["resolved"] = str(resolved).lower()

        data = self._request("GET", "/api/forecasts", params=params)
        raw_forecasts = data.get("forecasts", data if isinstance(data, list) else [])
        forecasts: list[PythiaForecast] = []
        for raw in raw_forecasts:
            try:
                forecasts.append(normalize_forecast(raw))
            except Exception as e:
                logger.warning("Skipping malformed forecast: %s", e)
        return forecasts

    def get_forecast(self, forecast_id: str) -> PythiaForecast | None:
        """Fetch a single forecast by ID."""
        try:
            data = self._request("GET", f"/api/forecasts/{forecast_id}")
            return normalize_forecast(data)
        except requests.HTTPError as e:
            if e.response.status_code == 404:
                return None
            raise

    def get_impact_analysis(self, target_id: str) -> dict[str, Any] | None:
        """Fetch an impact analysis for a given event or forecast ID."""
        try:
            return self._request("GET", f"/api/impacts/{target_id}")
        except requests.HTTPError as e:
            if e.response.status_code == 404:
                return None
            raise

    def health(self) -> dict[str, Any]:
        """Check API health."""
        return self._request("GET", "/health")

    def close(self) -> None:
        """Close the underlying HTTP session."""
        self._session.close()
