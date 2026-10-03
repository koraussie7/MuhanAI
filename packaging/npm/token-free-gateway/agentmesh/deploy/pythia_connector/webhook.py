"""Incoming Pythia webhook receiver.

Provides a minimal HTTP server that listens for real-time webhooks from
Pythia, validates them, normalizes the payload, and dispatches to handlers.

Run standalone:

    python -m pythia_connector.webhook --port 8080

Or mount in a WSGI/ASGI server. The handler is synchronous by default;
for high-throughput use, integrate with FastAPI or uvicorn.

Webhook security:
  - Optional HMAC-SHA256 signature verification (PYTHIA_WEBHOOK_SECRET).
  - Optional nonce-based replay protection (stores seen nonces in checkpoint).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Callable, Optional
from urllib.parse import urlparse

from .checkpoint import CheckpointStore
from .dedupe import EventDeduplicator, hash_event, hash_forecast
from .models import PythiaEvent, PythiaForecast, WebhookPayload
from .normalizer import normalize_event, normalize_forecast

logger = logging.getLogger("pythia_connector.webhook")

WEBHOOK_SECRET = os.environ.get("PYTHIA_WEBHOOK_SECRET", "")
WEBHOOK_HOST = os.environ.get("PYTHIA_WEBHOOK_HOST", "0.0.0.0")
WEBHOOK_PORT = int(os.environ.get("PYTHIA_WEBHOOK_PORT", "8080"))
REPLAY_WINDOW = int(os.environ.get("PYTHIA_REPLAY_WINDOW", "300"))  # seconds

EventHandler = Callable[[PythiaEvent], Any]
ForecastHandler = Callable[[PythiaForecast], Any]


def verify_signature(payload: bytes, signature: str, secret: str) -> bool:
    """Verify HMAC-SHA256 signature of a webhook payload."""
    if not secret:
        logger.warning("PYTHIA_WEBHOOK_SECRET not set — skipping signature verification")
        return True
    if not signature:
        return False
    # Strip 'sha256=' prefix if present (GitHub-style)
    if signature.startswith("sha256="):
        signature = signature[7:]
    expected = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def verify_nonce(payload: WebhookPayload, nonce_cache: CheckpointStore) -> bool:
    """Check nonce for replay protection. Returns True if valid (not replay)."""
    if not payload.nonce:
        return True  # nonce not required by spec

    state = nonce_cache.state
    if payload.nonce in state.processed_event_ids:
        logger.warning("Replay detected: nonce=%s", payload.nonce)
        return False

    # Check timestamp is within window
    if payload.timestamp:
        age = time.time() - payload.timestamp.timestamp()
        if abs(age) > REPLAY_WINDOW:
            logger.warning("Webhook timestamp outside replay window: age=%.1fs", age)
            return False

    state.processed_event_ids.add(payload.nonce)
    nonce_cache.save()
    return True


@dataclass
class WebhookResult:
    """Result of processing a single webhook payload."""

    accepted: bool
    event_processed: bool = False
    forecast_processed: bool = False
    duplicate: bool = False
    error: Optional[str] = None


class PythiaWebhookHandler(BaseHTTPRequestHandler):
    """HTTP request handler for Pythia webhooks."""

    # Override these via class attributes or subclassing
    on_event: Optional[EventHandler] = None
    on_forecast: Optional[ForecastHandler] = None
    checkpoint: Optional[CheckpointStore] = None
    dedupe: Optional[EventDeduplicator] = None
    agent_id: str = "pythia-webhook"

    # Class-level singletons (set in start_webhook_server)
    _on_event: Optional[EventHandler] = None
    _on_forecast: Optional[ForecastHandler] = None
    _checkpoint: Optional[CheckpointStore] = None
    _dedupe: Optional[EventDeduplicator] = None
    _agent_id: str = "pythia-webhook"

    def do_POST(self) -> None:
        """Handle incoming POST webhook."""
        parsed = urlparse(self.path)
        if parsed.path not in ("/webhook/pythia", "/webhook"):
            self._respond(404, {"error": "not found"})
            return

        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            self._respond(400, {"error": "empty body"})
            return

        body = self.rfile.read(content_length)

        # Verify signature
        signature = self.headers.get("X-Pythia-Signature", self.headers.get("X-Hub-Signature-256", ""))
        if signature.startswith("sha256="):
            signature = signature[7:]

        if not verify_signature(body, signature, WEBHOOK_SECRET):
            self._respond(401, {"error": "invalid signature"})
            return

        # Parse payload
        try:
            raw = json.loads(body)
        except json.JSONDecodeError:
            self._respond(400, {"error": "invalid JSON"})
            return

        try:
            payload = WebhookPayload.model_validate(raw)
        except Exception as exc:
            self._respond(400, {"error": f"invalid payload: {exc}"})
            return

        # Verify nonce
        checkpoint = self._checkpoint or CheckpointStore()
        if not verify_nonce(payload, checkpoint):
            self._respond(409, {"error": "replay detected"})
            return

        # Process based on event_type
        result = process_webhook_payload(
            payload=payload,
            on_event=self._on_event,
            on_forecast=self._on_forecast,
            checkpoint=checkpoint,
            dedupe=self._dedupe,
            agent_id=self._agent_id,
        )

        status = 200 if (result.accepted or result.duplicate) else 422
        self._respond(status, {
            "accepted": result.accepted,
            "duplicate": result.duplicate,
            "error": result.error,
        })

    def do_GET(self) -> None:
        """Health check endpoint."""
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self._respond(200, {"status": "ok", "service": "pythia-webhook"})
        else:
            self._respond(404, {"error": "not found"})

    def _respond(self, status: int, body: dict[str, Any]) -> None:
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args: Any) -> None:
        logger.debug("Webhook: " + format, *args)


def process_webhook_payload(
    payload: WebhookPayload,
    on_event: Optional[EventHandler],
    on_forecast: Optional[ForecastHandler],
    checkpoint: Optional[CheckpointStore] = None,
    dedupe: Optional[EventDeduplicator] = None,
    agent_id: str = "pythia-webhook",
) -> WebhookResult:
    """Process a validated webhook payload.

    Routes based on event_type:
      - 'event', 'evidence' → PythiaEvent
      - 'forecast', 'prediction' → PythiaForecast

    Returns a WebhookResult indicating what was processed.
    """
    checkpoint = checkpoint or CheckpointStore()
    dedupe = dedupe or EventDeduplicator(checkpoint=checkpoint)

    result = WebhookResult(accepted=True)

    data = payload.data
    event_type = payload.event_type.lower()

    # Determine if this is an event or forecast
    is_forecast_type = any(
        kw in event_type for kw in ("forecast", "prediction", "impact")
    )
    is_event_type = (
        any(kw in event_type for kw in ("event", "evidence", "alert"))
        or not is_forecast_type
    )

    if is_forecast_type:
        h = hash_forecast(data)
        if dedupe._seen_hashes.__contains__(h) or checkpoint.has_forecast(h):
            result.duplicate = True
            result.forecast_processed = False
            logger.info("Duplicate forecast webhook skipped: hash=%s", h[:16])
            return result

        try:
            forecast = normalize_forecast(data, agent_id=agent_id)
        except ValueError as exc:
            result.accepted = False
            result.error = f"forecast normalization failed: {exc}"
            logger.error(result.error)
            return result

        result.forecast_processed = True
        if on_forecast:
            try:
                on_forecast(forecast)
            except Exception as exc:
                result.error = f"on_forecast handler: {exc}"
                logger.error(result.error)

        dedupe.record_forecast(data, forecast_id=forecast.forecast_id)
        checkpoint.update_forecast(forecast.forecast_id)

    elif is_event_type:
        h = hash_event(data)
        if dedupe._seen_hashes.__contains__(h) or checkpoint.has_event(h):
            result.duplicate = True
            result.event_processed = False
            logger.info("Duplicate event webhook skipped: hash=%s", h[:16])
            return result

        try:
            event = normalize_event(data, agent_id=agent_id)
        except ValueError as exc:
            result.accepted = False
            result.error = f"event normalization failed: {exc}"
            logger.error(result.error)
            return result

        result.event_processed = True
        if on_event:
            try:
                on_event(event)
            except Exception as exc:
                result.error = f"on_event handler: {exc}"
                logger.error(result.error)

        dedupe.record_event(data, event_id=event.event_id)
        checkpoint.update_event(event.event_id, payload.timestamp.isoformat())

    checkpoint.save()
    return result


def start_webhook_server(
    on_event: Optional[EventHandler] = None,
    on_forecast: Optional[ForecastHandler] = None,
    checkpoint: Optional[CheckpointStore] = None,
    dedupe: Optional[EventDeduplicator] = None,
    host: str = WEBHOOK_HOST,
    port: int = WEBHOOK_PORT,
    agent_id: str = "pythia-webhook",
) -> HTTPServer:
    """Start the webhook HTTP server.

    Blocks until interrupted. Returns the server instance.
    """
    # Inject callbacks into the handler class
    PythiaWebhookHandler._on_event = on_event
    PythiaWebhookHandler._on_forecast = on_forecast
    PythiaWebhookHandler._checkpoint = checkpoint
    PythiaWebhookHandler._dedupe = dedupe
    PythiaWebhookHandler._agent_id = agent_id

    server = HTTPServer((host, port), PythiaWebhookHandler)
    logger.info("Pythia webhook server listening on %s:%d", host, port)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Webhook server shutting down")
    finally:
        server.server_close()

    return server


def main() -> None:
    """CLI entry point for the webhook receiver."""
    import argparse

    logging.basicConfig(
        level=os.environ.get("PYTHIA_LOG_LEVEL", "INFO"),
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    parser = argparse.ArgumentParser(description="Pythia Webhook Receiver")
    parser.add_argument("--host", default=WEBHOOK_HOST)
    parser.add_argument("--port", type=int, default=WEBHOOK_PORT)
    parser.add_argument("--agent-id", default="pythia-webhook")
    args = parser.parse_args()

    # Default handlers just log
    def default_event(event: PythiaEvent) -> None:
        logger.info("Webhook event: %s [%s]", event.event_id, event.kind)

    def default_forecast(forecast: PythiaForecast) -> None:
        logger.info("Webhook forecast: %s", forecast.forecast_id)

    start_webhook_server(
        on_event=default_event,
        on_forecast=default_forecast,
        host=args.host,
        port=args.port,
        agent_id=args.agent_id,
    )


if __name__ == "__main__":
    main()
