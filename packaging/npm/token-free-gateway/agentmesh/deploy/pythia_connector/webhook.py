"""SSE and HTTP webhook receiver for real-time Pythia event ingestion."""

from __future__ import annotations

import json
import logging
import threading
from typing import Any, Callable

import requests

from pythia_connector.models import WebhookPayload
from pythia_connector.normalizer import normalize_webhook_payload
from pythia_connector.retry import with_retry

logger = logging.getLogger(__name__)

WebhookHandler = Callable[[WebhookPayload], None]


class WebhookReceiver:
    """Receives Pythia events via HTTP polling or SSE streaming.

    Supports two modes:
      - HTTP polling: repeatedly polls an endpoint for new events.
      - SSE streaming: opens a persistent SSE stream and processes
        events as they arrive.
    """

    def __init__(self, api_url: str, api_key: str | None = None):
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key
        self._headers = {"Content-Type": "application/json"}
        if api_key:
            self._headers["Authorization"] = f"Bearer {api_key}"
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start_polling(
        self,
        handler: WebhookHandler,
        interval: float = 5.0,
        since: str | None = None,
    ) -> threading.Thread:
        """Start polling for webhook payloads in a background thread."""
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._poll_loop,
            args=(handler, interval, since),
            daemon=True,
        )
        self._thread.start()
        return self._thread

    def _poll_loop(
        self,
        handler: WebhookHandler,
        interval: float,
        since: str | None,
    ) -> None:
        cursor = since
        while not self._stop_event.is_set():
            try:
                payloads = self._fetch(since=cursor)
                for payload in payloads:
                    handler(payload)
                    cursor = payload.timestamp.isoformat()
            except Exception as e:
                logger.error("Webhook polling error: %s", e)
            self._stop_event.wait(interval)

    def stop(self) -> None:
        """Stop the background polling/streaming thread."""
        self._stop_event.set()

    @with_retry(max_attempts=3)
    def _fetch(self, since: str | None = None) -> list[WebhookPayload]:
        """Fetch webhook payloads from the HTTP endpoint."""
        url = f"{self.api_url}/webhooks/events"
        params: dict[str, Any] = {}
        if since:
            params["since"] = since
        response = requests.get(url, headers=self._headers, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        raw_payloads = data.get("payloads", data if isinstance(data, list) else [])
        payloads: list[WebhookPayload] = []
        for raw in raw_payloads:
            try:
                payloads.append(normalize_webhook_payload(raw))
            except Exception as e:
                logger.warning("Skipping malformed webhook payload: %s", e)
        return payloads

    def start_sse(self, handler: WebhookHandler) -> threading.Thread:
        """Start an SSE stream in a background thread."""
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._sse_loop,
            args=(handler,),
            daemon=True,
        )
        self._thread.start()
        return self._thread

    def _sse_loop(self, handler: WebhookHandler) -> None:
        """Process Server-Sent Events from a persistent stream."""
        url = f"{self.api_url}/webhooks/events/stream"
        with requests.get(url, headers=self._headers, stream=True, timeout=30) as response:
            if response.status_code != 200:
                raise ConnectionError(f"SSE stream returned {response.status_code}")
            for line in response.iter_lines(decode_unicode=True):
                if self._stop_event.is_set():
                    break
                if not line:
                    continue
                if line.startswith(":"):
                    continue
                if line.startswith("data:"):
                    try:
                        payload = normalize_webhook_payload(json.loads(line[5:].strip()))
                        handler(payload)
                    except Exception as e:
                        logger.warning("Failed to process SSE event: %s", e)


class HTTPWebhookServer:
    """Minimal HTTP webhook receiver using the standard library."""

    def __init__(
        self,
        host: str = "0.0.0.0",
        port: int = 9090,
        handler: WebhookHandler | None = None,
    ):
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

        self.host = host
        self.port = port
        self.handler = handler
        self._server: ThreadingHTTPServer | None = None

        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):  # noqa: N802
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length) if length else b""
                try:
                    raw = json.loads(body)
                    payload = normalize_webhook_payload(raw)
                    if outer.handler:
                        outer.handler(payload)
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(b'{"status":"ok"}')
                except Exception as e:
                    logger.error("Webhook handling error: %s", e)
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(b'{"error":"bad request"}')

            def log_message(self, fmt, *args):
                logger.debug("Webhook server: " + fmt, *args)

        self._handler_class = Handler

    def start(self) -> ThreadingHTTPServer:
        """Start the HTTP webhook server (blocking)."""
        from http.server import ThreadingHTTPServer

        self._server = ThreadingHTTPServer((self.host, self.port), self._handler_class)
        logger.info("Webhook server listening on %s:%d", self.host, self.port)
        self._server.serve_forever()

    def stop(self) -> None:
        if self._server:
            self._server.shutdown()
