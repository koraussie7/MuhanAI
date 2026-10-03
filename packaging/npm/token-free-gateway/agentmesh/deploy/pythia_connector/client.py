"""HTTP client for the Pythia API.

Follows the same convention as joovideo-dm/auth_dailymotion.py:
  - uses `requests` for HTTP
  - loads env from .env at project root
  - supports API-key auth via PYTHIA_API_KEY env var

Endpoints:
  GET  /v1/events       — list events (incremental via ?after=<timestamp>)
  GET  /v1/events/{id} — single event
  GET  /v1/forecasts     — list forecasts
  GET  /v1/forecasts/{id} — single forecast
  GET  /v1/impact/{id}   — impact analysis for an event/forecast
"""

from __future__ import annotations

import logging
import os
import time
from configparser import ConfigParser
from pathlib import Path
from typing import Any, Optional, Union
from urllib.parse import urljoin

import requests

from .models import PythiaEvent, PythiaForecast, ImpactAnalysis

logger = logging.getLogger("pythia_connector.client")

PYTHIA_BASE_URL = os.environ.get("PYTHIA_BASE_URL", "https://pythia.muhanai.com/api")
PYTHIA_API_KEY = os.environ.get("PYTHIA_API_KEY", "")
PYTHIA_TIMEOUT = float(os.environ.get("PYTHIA_TIMEOUT", "30"))
PYTHIA_RETRY_COUNT = int(os.environ.get("PYTHIA_RETRY_COUNT", "3"))
PYTHIA_RETRY_DELAY = float(os.environ.get("PYTHIA_RETRY_DELAY", "1.0"))


def load_env(env_path: Optional[Union[str, Path]] = None) -> dict[str, str]:
    """Load .env from project root if it exists (mirrors dailymotion auth pattern)."""
    if env_path is None:
        env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    else:
        env_path = Path(env_path)

    env: dict[str, str] = {}
    if env_path.exists():
        logger.info("Loading .env from %s", env_path)
        parser = ConfigParser()
        with open(env_path, "r", encoding="utf-8") as f:
            content = f.read()
        for line in content.splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                key, _, value = line.partition("=")
                env[key.strip()] = value.strip()
                os.environ.setdefault(key.strip(), value.strip())
    return env


class PythiaClient:
    """Thin HTTP client wrapping the Pythia REST API.

    All methods return parsed Pydantic models and raise `requests.HTTPError`
    on non-2xx responses (after retries).
    """

    def __init__(
        self,
        base_url: str = PYTHIA_BASE_URL,
        api_key: str = PYTHIA_API_KEY,
        timeout: float = PYTHIA_TIMEOUT,
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
            self._session.headers["Authorization"] = f"Bearer {api_key}"

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        """Core request method with retry + error logging."""
        url = urljoin(self.base_url, path.lstrip("/"))
        kwargs.setdefault("timeout", self.timeout)

        last_exc: Optional[Exception] = None
        for attempt in range(1, PYTHIA_RETRY_COUNT + 1):
            try:
                resp = self._session.request(method, url, **kwargs)
                resp.raise_for_status()
                if resp.headers.get("Content-Type", "").startswith("application/json"):
                    return resp.json()
                return resp.text
            except requests.RequestException as exc:
                last_exc = exc
                if attempt < PYTHIA_RETRY_COUNT:
                    backoff = PYTHIA_RETRY_DELAY * (2 ** (attempt - 1))
                    logger.warning(
                        "Pythia API %s %s attempt %d/%d failed: %s — retrying in %.1fs",
                        method,
                        url,
                        attempt,
                        PYTHIA_RETRY_COUNT,
                        exc,
                        backoff,
                    )
                    time.sleep(backoff)

        logger.error("Pythia API %s %s failed after %d attempts", method, url, PYTHIA_RETRY_COUNT)
        raise last_exc  # type: ignore[misc]

    def get_events(
        self,
        after: Optional[str] = None,
        limit: int = 100,
        agent_id: Optional[str] = None,
    ) -> list[PythiaEvent]:
        """Fetch events incrementally since a timestamp (ISO-8601 UTC).

        Args:
            after: ISO timestamp or event_id cursor.
            limit: max events per page.
            agent_id: filter by source agent.
        """
        params: dict[str, Any] = {"limit": limit}
        if after:
            params["after"] = after
        if agent_id:
            params["agent_id"] = agent_id

        raw = self._request("GET", "/v1/events", params=params)
        if isinstance(raw, dict) and "events" in raw:
            raw = raw["events"]
        if not isinstance(raw, list):
            raise ValueError(f"Unexpected Pythia events response: {type(raw)}")

        events: list[PythiaEvent] = []
        for item in raw:
            try:
                events.append(PythiaEvent.model_validate(item))
            except Exception as exc:
                logger.warning("Skipping malformed event: %s — %s", item.get("event_id", "?"), exc)
        return events

    def get_event(self, event_id: str) -> PythiaEvent:
        """Fetch a single event by ID."""
        raw = self._request("GET", f"/v1/events/{event_id}")
        return PythiaEvent.model_validate(raw)

    def get_forecasts(
        self,
        after: Optional[str] = None,
        limit: int = 50,
        resolved: Optional[bool] = None,
    ) -> list[PythiaForecast]:
        """Fetch forecasts, optionally filtered by resolution status."""
        params: dict[str, Any] = {"limit": limit}
        if after:
            params["after"] = after
        if resolved is not None:
            params["resolved"] = str(resolved).lower()

        raw = self._request("GET", "/v1/forecasts", params=params)
        if isinstance(raw, dict) and "forecasts" in raw:
            raw = raw["forecasts"]
        if not isinstance(raw, list):
            raise ValueError(f"Unexpected Pythia forecasts response: {type(raw)}")

        forecasts: list[PythiaForecast] = []
        for item in raw:
            try:
                forecasts.append(PythiaForecast.model_validate(item))
            except Exception as exc:
                logger.warning(
                    "Skipping malformed forecast: %s — %s", item.get("forecast_id", "?"), exc
                )
        return forecasts

    def get_forecast(self, forecast_id: str) -> PythiaForecast:
        """Fetch a single forecast by ID."""
        raw = self._request("GET", f"/v1/forecasts/{forecast_id}")
        return PythiaForecast.model_validate(raw)

    def get_impact(self, target_id: str) -> ImpactAnalysis:
        """Fetch impact analysis for an event or forecast."""
        raw = self._request("GET", f"/v1/impact/{target_id}")
        return ImpactAnalysis.model_validate(raw)

    def health_check(self) -> dict[str, Any]:
        """Simple health check against Pythia API."""
        return self._request("GET", "/v1/health")

    def close(self) -> None:
        """Close underlying HTTP session."""
        self._session.close()

    def __enter__(self) -> "PythiaClient":
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.close()


# Module-level convenience for simple scripts
_default_client: Optional[PythiaClient] = None


def get_client() -> PythiaClient:
    """Return a cached default client (lazy init)."""
    global _default_client
    if _default_client is None:
        load_env()
        _default_client = PythiaClient()
    return _default_client
