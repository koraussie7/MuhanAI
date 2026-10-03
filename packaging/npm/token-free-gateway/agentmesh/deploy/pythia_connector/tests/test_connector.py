"""Unit tests for the Pythia Connector.

Uses stdlib `unittest` (no external deps required beyond pydantic + requests).
Run:  python3 -m pytest deploy/pythia-connector/tests/  OR
      python3 -m unittest deploy.pythia_connector.tests.test_connector

Note: pytest may not be installed — tests are compatible with unittest runner.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure deploy/pythia-connector is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pythia_connector.models import (  # noqa: E402
    CheckpointState,
    EventSeverity,
    ForecastConfidence,
    ImpactAnalysis,
    ImpactTier,
    PythiaEvent,
    PythiaForecast,
    WebhookPayload,
)
from pythia_connector.normalizer import (  # noqa: E402
    _generate_id,
    _map_confidence,
    _map_severity,
    _parse_timestamp,
    normalize_event,
    normalize_forecast,
    normalize_impact,
)
from pythia_connector.dedupe import (  # noqa: E402
    EventDeduplicator,
    hash_event,
    hash_forecast,
)
from pythia_connector.checkpoint import CheckpointStore, CHECKPOINT_VERSION  # noqa: E402
from pythia_connector.retry import retry  # noqa: E402
from pythia_connector.colibri_metrics import (  # noqa: E402
    ColibriMetrics,
    ColibriMemoryMetrics,
    ColibriInferenceMetrics,
    ColibriP2PMetrics,
    ColibriModelInfo,
    PeerMetrics,
    ModelChunkMetrics,
    colibri_metrics_to_dict,
    peer_metrics_to_dict,
    chunk_metrics_to_dict,
    build_colibri_metrics_packet,
    event_to_peer_metrics,
    forecast_to_peer_metrics,
    impact_to_chunk_metrics,
)
from pythia_connector.webhook import verify_signature, process_webhook_payload  # noqa: E402


# ───── Models Tests ─────

class TestPythiaEvent(unittest.TestCase):
    """Test PythiaEvent schema validation."""

    def test_valid_event(self) -> None:
        event = PythiaEvent(
            event_id="evt-001",
            source_agent="test-agent",
            kind="evidence",
            title="Test Event",
            body="Some evidence body",
        )
        self.assertEqual(event.event_id, "evt-001")
        self.assertEqual(event.source_agent, "test-agent")
        self.assertEqual(event.kind, "evidence")
        self.assertEqual(event.severity, EventSeverity.INFO)

    def test_default_timestamp_is_utc(self) -> None:
        event = PythiaEvent(
            event_id="evt-002",
            source_agent="agent",
            kind="test",
            title="T",
            body="B",
        )
        self.assertIsNotNone(event.timestamp)
        self.assertEqual(event.timestamp.tzinfo, timezone.utc)

    def test_event_id_too_short_raises(self) -> None:
        with self.assertRaises(Exception):
            PythiaEvent(
                event_id="x",
                source_agent="agent",
                kind="test",
                title="T",
                body="B",
            )

    def test_self_referential_parent_raises(self) -> None:
        with self.assertRaises(Exception):
            PythiaEvent(
                event_id="evt-003",
                source_agent="agent",
                kind="test",
                title="T",
                body="B",
                parent_event_id="evt-003",
            )

    def test_extra_fields_ignored(self) -> None:
        event = PythiaEvent(
            event_id="evt-004",
            source_agent="agent",
            kind="test",
            title="T",
            body="B",
        )
        # Extra fields are silently ignored
        raw = {"event_id": "evt-004", "source_agent": "agent", "kind": "test",
               "title": "T", "body": "B", "extra_field": "should_be_ignored"}
        parsed = PythiaEvent.model_validate(raw)
        self.assertEqual(parsed.event_id, "evt-004")
        self.assertFalse(hasattr(parsed, "extra_field"))


class TestPythiaForecast(unittest.TestCase):
    """Test PythiaForecast schema validation."""

    def test_valid_forecast(self) -> None:
        forecast = PythiaForecast(
            forecast_id="fc-001",
            agent_id="test-agent",
            hypothesis="What is the answer?",
            outcome="42",
            confidence=ForecastConfidence.HIGH,
            confidence_numeric=0.85,
        )
        self.assertEqual(forecast.forecast_id, "fc-001")
        self.assertEqual(forecast.confidence, ForecastConfidence.HIGH)

    def test_certain_confidence_requires_numeric_1(self) -> None:
        with self.assertRaises(Exception):
            PythiaForecast(
                forecast_id="fc-002",
                agent_id="test-agent",
                hypothesis="Q",
                outcome="A",
                confidence=ForecastConfidence.CERTAIN,
                confidence_numeric=0.99,
            )

    def test_numeric_confidence_autobuckets(self) -> None:
        """confidence_numeric auto-adjusts confidence tier."""
        forecast = PythiaForecast(
            forecast_id="fc-003",
            agent_id="test-agent",
            hypothesis="Q",
            outcome="A",
            confidence=ForecastConfidence.LOW,
            confidence_numeric=0.95,
        )
        # 0.95 should autobucket to HIGH
        self.assertEqual(forecast.confidence, ForecastConfidence.HIGH)

    def test_missing_numeric_no_error(self) -> None:
        forecast = PythiaForecast(
            forecast_id="fc-004",
            agent_id="test-agent",
            hypothesis="Q",
            outcome="A",
            confidence=ForecastConfidence.MEDIUM,
        )
        self.assertIsNone(forecast.confidence_numeric)


class TestImpactAnalysis(unittest.TestCase):
    """Test ImpactAnalysis schema."""

    def test_valid_impact(self) -> None:
        impact = ImpactAnalysis(
            target_id="evt-001",
            target_type="event",
            tier=ImpactTier.HIGH,
            score=0.85,
            affected_agents=["claude-thin-client", "crates"],
            rationale="Critical model performance issue",
            generated_by="test-agent",
        )
        self.assertEqual(impact.target_id, "evt-001")
        self.assertEqual(impact.tier, ImpactTier.HIGH)

    def test_invalid_target_type_raises(self) -> None:
        with self.assertRaises(Exception):
            ImpactAnalysis(
                target_id="x",
                target_type="unknown",
                tier=ImpactTier.LOW,
                score=0.1,
                affected_agents=["agent"],
                rationale="test",
            )

    def test_score_bounds(self) -> None:
        with self.assertRaises(Exception):
            ImpactAnalysis(
                target_id="x",
                target_type="event",
                tier=ImpactTier.LOW,
                score=1.5,  # exceeds 1.0
                affected_agents=["agent"],
                rationale="test",
            )
        with self.assertRaises(Exception):
            ImpactAnalysis(
                target_id="x",
                target_type="event",
                tier=ImpactTier.LOW,
                score=-0.1,  # below 0.0
                affected_agents=["agent"],
                rationale="test",
            )


class TestWebhookPayload(unittest.TestCase):
    """Test WebhookPayload envelope."""

    def test_valid_payload(self) -> None:
        now = datetime.now(timezone.utc)
        payload = WebhookPayload(
            eventType="event",
            timestamp=now,
            source="pythia",
            data={"event_id": "evt-1", "kind": "evidence", "title": "T", "body": "B"},
        )
        self.assertEqual(payload.event_type, "event")
        self.assertEqual(payload.source, "pythia")

    def test_payload_uses_alias(self) -> None:
        """Verify eventType alias works."""
        now = datetime.now(timezone.utc)
        raw = {
            "eventType": "forecast",
            "timestamp": now.isoformat(),
            "source": "pythia",
            "data": {},
        }
        payload = WebhookPayload.model_validate(raw)
        self.assertEqual(payload.event_type, "forecast")


# ───── Normalizer Tests ─────

class TestNormalizeEvent(unittest.TestCase):
    """Test raw → PythiaEvent normalization."""

    def test_simple_event(self) -> None:
        raw = {
            "event_id": "evt-001",
            "source_agent": "test-agent",
            "kind": "evidence",
            "timestamp": "2026-10-01T12:00:00Z",
            "title": "Model deployed",
            "body": "GLM-5.2 deployed to fellowship node",
            "severity": "high",
        }
        event = normalize_event(raw, agent_id="normalizer")
        self.assertEqual(event.event_id, "evt-001")
        self.assertEqual(event.severity, EventSeverity.WARNING)

    def test_field_remapping(self) -> None:
        """Test that raw field names are remapped correctly."""
        raw = {
            "id": "evt-002",
            "agent": "claude-agent",
            "type": "model_update",
            "ts": "2026-10-01T12:00:00Z",
            "msg": "Model loaded",
            "level": "critical",
        }
        event = normalize_event(raw, agent_id="norm")
        self.assertEqual(event.event_id, "evt-002")
        self.assertEqual(event.source_agent, "claude-agent")
        self.assertEqual(event.kind, "model_update")
        self.assertEqual(event.severity, EventSeverity.CRITICAL)

    def test_generated_id_when_missing(self) -> None:
        """When event_id is missing, a deterministic ID is generated."""
        raw = {
            "kind": "evidence",
            "title": "Test",
            "body": "Body",
            "timestamp": "2026-10-01T12:00:00Z",
        }
        event = normalize_event(raw, agent_id="test-agent")
        self.assertTrue(event.event_id.startswith("py-"))
        self.assertTrue(len(event.event_id) > 8)

    def test_same_event_generates_same_id(self) -> None:
        """Deterministic ID: same seed → same ID."""
        raw = {
            "kind": "evidence",
            "title": "Same event",
            "body": "Same body",
            "timestamp": "2026-10-01T12:00:00Z",
        }
        e1 = normalize_event(raw, agent_id="test-agent")
        e2 = normalize_event(raw, agent_id="test-agent")
        self.assertEqual(e1.event_id, e2.event_id)

    def test_severity_mapping_critical(self) -> None:
        raw = {"event_id": "evt-c1", "source_agent": "a", "kind": "k",
               "title": "T", "body": "B", "severity": "CRITICAL"}
        event = normalize_event(raw)
        self.assertEqual(event.severity, EventSeverity.CRITICAL)

    def test_severity_mapping_fatal(self) -> None:
        raw = {"event_id": "evt-f1", "source_agent": "a", "kind": "k",
               "title": "T", "body": "B", "severity": "FATAL"}
        event = normalize_event(raw)
        self.assertEqual(event.severity, EventSeverity.FATAL)

    def test_invalid_event_fills_defaults(self) -> None:
        """Missing required fields should be filled with defaults, not raise."""
        raw = {"event_id": "evt-xyz", "source_agent": "a"}  # no kind, title, body
        event = normalize_event(raw)
        self.assertIsInstance(event, PythiaEvent)
        self.assertEqual(event.kind, "generic")

    def test_unmappable_fields_go_to_metadata(self) -> None:
        raw = {
            "event_id": "evt-meta",
            "source_agent": "agent",
            "kind": "test",
            "title": "T",
            "body": "B",
            "custom_field": "value",
            "another": 123,
        }
        event = normalize_event(raw)
        self.assertIn("custom_field", event.metadata)
        self.assertEqual(event.metadata["custom_field"], "value")
        self.assertEqual(event.metadata["another"], 123)


class TestNormalizeForecast(unittest.TestCase):
    """Test raw → PythiaForecast normalization."""

    def test_simple_forecast(self) -> None:
        raw = {
            "forecast_id": "fc-001",
            "agent_id": "test-agent",
            "hypothesis": "Will the model deploy?",
            "outcome": "Yes",
            "confidence": "high",
            "confidence_numeric": 0.85,
            "horizon": "7d",
        }
        forecast = normalize_forecast(raw, agent_id="norm")
        self.assertEqual(forecast.forecast_id, "fc-001")
        self.assertEqual(forecast.confidence, ForecastConfidence.HIGH)
        self.assertEqual(forecast.confidence_numeric, 0.85)

    def test_numeric_confidence_autobucket(self) -> None:
        raw = {
            "forecast_id": "fc-002",
            "agent_id": "agent",
            "hypothesis": "Q",
            "outcome": "A",
            "confidence": "low",
        }
        forecast = normalize_forecast(raw)
        # "low" string → LOW confidence
        self.assertEqual(forecast.confidence, ForecastConfidence.LOW)

    def test_generated_id_when_missing(self) -> None:
        raw = {
            "hypothesis": "Will it work?",
            "outcome": "Maybe",
        }
        forecast = normalize_forecast(raw, agent_id="agent")
        self.assertTrue(forecast.forecast_id.startswith("py-"))

    def test_supporting_events_attached(self) -> None:
        raw = {
            "forecast_id": "fc-003",
            "agent_id": "agent",
            "hypothesis": "Q",
            "outcome": "A",
            "confidence": "medium",
        }
        forecast = normalize_forecast(raw, supporting_event_ids=["evt-1", "evt-2"])
        self.assertEqual(forecast.supporting_events, ["evt-1", "evt-2"])


class TestNormalizeImpact(unittest.TestCase):
    def test_impact_from_score(self) -> None:
        raw = {"score": 0.75, "affected_agents": ["a1", "a2"]}
        impact = normalize_impact(raw, target_id="evt-001", target_type="event")
        self.assertGreaterEqual(impact.score, 0.7)
        self.assertIn("a1", impact.affected_agents)

    def test_impact_tier_from_string(self) -> None:
        raw = {"tier": "HIGH", "score": 0.6}
        impact = normalize_impact(raw, target_id="fc-001", target_type="forecast")
        self.assertEqual(impact.tier, ImpactTier.HIGH)


# ───── Dedupe Tests ─────

class TestDedupe(unittest.TestCase):
    """Test content-hash deduplication."""

    def test_hash_event_deterministic(self) -> None:
        event = {"kind": "test", "title": "Same", "body": "Content",
                 "source_agent": "a", "timestamp": "2026-01-01T00:00:00Z"}
        h1 = hash_event(event)
        h2 = hash_event(event)
        self.assertEqual(h1, h2)

    def test_hash_forecast_deterministic(self) -> None:
        forecast = {"hypothesis": "Q", "outcome": "A",
                    "confidence": "high", "agent_id": "a"}
        h1 = hash_forecast(forecast)
        h2 = hash_forecast(forecast)
        self.assertEqual(h1, h2)

    def test_hash_different_content_different_hash(self) -> None:
        e1 = {"kind": "a", "title": "T1", "body": "B1", "source_agent": "a", "timestamp": "t1"}
        e2 = {"kind": "a", "title": "T2", "body": "B1", "source_agent": "a", "timestamp": "t1"}
        self.assertNotEqual(hash_event(e1), hash_event(e2))

    def test_deduplicator_memory(self) -> None:
        dedupe = EventDeduplicator()
        event = {"kind": "k", "title": "T", "body": "B", "source_agent": "a", "timestamp": "t"}
        self.assertFalse(dedupe.is_duplicate_event(event))
        dedupe.record_event(event)
        self.assertTrue(dedupe.is_duplicate_event(event))

    def test_deduplicator_stats(self) -> None:
        dedupe = EventDeduplicator()
        stats = dedupe.stats()
        self.assertIn("seen_hashes_memory", stats)
        self.assertIn("seen_events_checkpoint", stats)

    def test_hash_ignores_field_order(self) -> None:
        """JSON canonicalization means key order doesn't affect hash."""
        e1 = {"kind": "k", "title": "T", "body": "B", "source_agent": "a", "timestamp": "t"}
        e2 = {"timestamp": "t", "body": "B", "source_agent": "a", "title": "T", "kind": "k"}
        self.assertEqual(hash_event(e1), hash_event(e2))


# ───── Checkpoint Tests ─────

class TestCheckpointStore(unittest.TestCase):
    """Test checkpoint persistence and resume-after state."""

    def setUp(self) -> None:
        self._tmpdir = tempfile.mkdtemp()
        self._path = Path(self._tmpdir) / ".checkpoint.json"

    def tearDown(self) -> None:
        import shutil
        shutil.rmtree(self._tmpdir, ignore_errors=True)

    def test_fresh_checkpoint(self) -> None:
        store = CheckpointStore(path=self._path)
        state = store.state
        self.assertIsNone(state.last_event_timestamp)
        self.assertEqual(len(state.processed_event_ids), 0)

    def test_save_and_load(self) -> None:
        store = CheckpointStore(path=self._path)
        store.update_event("evt-001", "2026-10-01T12:00:00+00:00")
        store.update_forecast("fc-001")
        store.save()

        # New store should load the state
        store2 = CheckpointStore(path=self._path)
        self.assertTrue(store2.has_event("evt-001"))
        self.assertTrue(store2.has_forecast("fc-001"))
        self.assertIsNotNone(store2.state.last_event_timestamp)

    def test_atomic_write(self) -> None:
        """Checkpoint write should be atomic (temp file + rename)."""
        store = CheckpointStore(path=self._path)
        store.update_event("evt-001")
        store.save()

        # File should exist and be valid JSON
        self.assertTrue(self._path.exists())
        with open(self._path) as f:
            data = json.load(f)
        self.assertIn("processed_event_ids", data)

    def test_no_intermediate_temp_file(self) -> None:
        """After save, no .tmp files should remain."""
        store = CheckpointStore(path=self._path)
        store.update_event("evt-001")
        store.save()

        tmp_files = list(self._path.parent.glob(".checkpoint_*.json.tmp"))
        self.assertEqual(len(tmp_files), 0)

    def test_get_cursor(self) -> None:
        store = CheckpointStore(path=self._path)
        self.assertIsNone(store.get_cursor())

        store.update_event("evt-001", "2026-10-01T12:00:00+00:00")
        cursor = store.get_cursor()
        self.assertIsNotNone(cursor)

    def test_reset(self) -> None:
        store = CheckpointStore(path=self._path)
        store.update_event("evt-001")
        store.save()

        store.reset()
        self.assertEqual(len(store.state.processed_event_ids), 0)


# ───── Retry Tests ─────

class TestRetry(unittest.TestCase):
    """Test the retry decorator."""

    def test_success_on_first_try(self) -> None:
        call_count = 0

        @retry(attempts=3, base_delay=0.01)
        def succeed() -> str:
            nonlocal call_count
            call_count += 1
            return "ok"

        result = succeed()
        self.assertEqual(result, "ok")
        self.assertEqual(call_count, 1)

    def test_retries_on_exception(self) -> None:
        call_count = 0

        @retry(attempts=3, base_delay=0.01, backoff=1.0)
        def flaky() -> str:
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise TimeoutError("timeout")
            return "ok"

        result = flaky()
        self.assertEqual(result, "ok")
        self.assertEqual(call_count, 3)

    def test_exhausted_retries_raises(self) -> None:
        call_count = 0

        @retry(attempts=2, base_delay=0.01, backoff=1.0)
        def always_fail() -> str:
            nonlocal call_count
            call_count += 1
            raise ConnectionError("down")

        with self.assertRaises(ConnectionError):
            always_fail()
        self.assertEqual(call_count, 2)

    def test_no_retry_on_non_retryable(self) -> None:
        call_count = 0

        @retry(attempts=3, base_delay=0.01)
        def value_error() -> str:
            nonlocal call_count
            call_count += 1
            raise ValueError("not retryable")

        with self.assertRaises(ValueError):
            value_error()
        self.assertEqual(call_count, 1)  # no retries

    def test_jitter_variation(self) -> None:
        """With jitter=True, delays should vary."""
        delays: list[float] = []

        @retry(attempts=5, base_delay=1.0, jitter=True, backoff=1.0)
        def collect_delays() -> None:
            raise TimeoutError("fail")

        with patch("pythia_connector.retry.time.sleep") as mock_sleep:
            mock_sleep.side_effect = lambda d: delays.append(d)
            try:
                collect_delays()
            except TimeoutError:
                pass

        self.assertEqual(len(delays), 4)  # attempts-1 retries


# ───── Webhook Tests ─────

class TestWebhook(unittest.TestCase):
    """Test webhook signature verification and payload processing."""

    def test_signature_verification_no_secret(self) -> None:
        """Without a secret, signature verification is skipped (warns)."""
        result = verify_signature(b"payload", "", "")
        self.assertTrue(result)

    def test_signature_verification_valid(self) -> None:
        """Valid HMAC signature matches."""
        secret = "my-secret"
        payload = b'{"eventType": "event"}'
        import hmac as _hmac
        expected = _hmac.new(secret.encode(), payload, "sha256").hexdigest()
        result = verify_signature(payload, expected, secret)
        self.assertTrue(result)

    def test_signature_verification_invalid(self) -> None:
        secret = "my-secret"
        result = verify_signature(b"payload", "wrong-signature", secret)
        self.assertFalse(result)

    def test_signature_verification_sha256_prefix(self) -> None:
        """Strip 'sha256=' prefix if present."""
        secret = "my-secret"
        payload = b'{"eventType": "event"}'
        import hmac as _hmac
        expected = _hmac.new(secret.encode(), payload, "sha256").hexdigest()
        result = verify_signature(payload, f"sha256={expected}", secret)
        self.assertTrue(result)

    def test_process_event_webhook(self) -> None:
        """Test processing an event-type webhook payload."""
        now = datetime.now(timezone.utc)
        payload = WebhookPayload(
            event_type="event",
            timestamp=now,
            source="pythia",
            data={
                "event_id": "evt-webhook-1",
                "source_agent": "webhook-sender",
                "kind": "evidence",
                "title": "Webhook Event",
                "body": "Received via webhook",
                "timestamp": now.isoformat(),
                "severity": "warning",
            },
        )

        events_received: list[PythiaEvent] = []

        def on_event(event: PythiaEvent) -> None:
            events_received.append(event)

        with tempfile.TemporaryDirectory() as tmpdir:
            checkpoint = CheckpointStore(path=Path(tmpdir) / ".checkpoint.json")
            result = process_webhook_payload(
                payload=payload,
                on_event=on_event,
                on_forecast=None,
                checkpoint=checkpoint,
            )

        self.assertTrue(result.accepted)
        self.assertTrue(result.event_processed)
        self.assertFalse(result.duplicate)
        self.assertEqual(len(events_received), 1)
        self.assertEqual(events_received[0].event_id, "evt-webhook-1")
        self.assertEqual(events_received[0].severity, EventSeverity.WARNING)

    def test_process_forecast_webhook(self) -> None:
        """Test processing a forecast-type webhook payload."""
        now = datetime.now(timezone.utc)
        payload = WebhookPayload(
            event_type="forecast",
            timestamp=now,
            source="pythia",
            data={
                "forecast_id": "fc-webhook-1",
                "agent_id": "forecast-sender",
                "hypothesis": "Will it work?",
                "outcome": "Yes",
                "confidence": "high",
                "confidence_numeric": 0.88,
            },
        )

        forecasts_received: list[PythiaForecast] = []

        def on_forecast(forecast: PythiaForecast) -> None:
            forecasts_received.append(forecast)

        with tempfile.TemporaryDirectory() as tmpdir:
            checkpoint = CheckpointStore(path=Path(tmpdir) / ".checkpoint.json")
            result = process_webhook_payload(
                payload=payload,
                on_event=None,
                on_forecast=on_forecast,
                checkpoint=checkpoint,
            )

        self.assertTrue(result.accepted)
        self.assertTrue(result.forecast_processed)
        self.assertEqual(len(forecasts_received), 1)
        self.assertEqual(forecasts_received[0].forecast_id, "fc-webhook-1")
        self.assertEqual(forecasts_received[0].confidence, ForecastConfidence.HIGH)

    def test_duplicate_webhook_rejected(self) -> None:
        """Same content hash → duplicate detection."""
        now = datetime.now(timezone.utc)
        data = {
            "event_id": "evt-dup-1",
            "source_agent": "sender",
            "kind": "evidence",
            "title": "Dup",
            "body": "Same content",
            "timestamp": now.isoformat(),
        }
        payload = WebhookPayload(
            event_type="event",
            timestamp=now,
            source="pythia",
            data=data,
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            checkpoint = CheckpointStore(path=Path(tmpdir) / ".checkpoint.json")
            dedupe = EventDeduplicator(checkpoint=checkpoint)

            # First call — should be accepted
            result1 = process_webhook_payload(
                payload=payload,
                on_event=lambda e: None,
                on_forecast=None,
                checkpoint=checkpoint,
                dedupe=dedupe,
            )
            self.assertTrue(result1.accepted)
            self.assertFalse(result1.duplicate)

            # Second call with same data — should be duplicate
            result2 = process_webhook_payload(
                payload=payload,
                on_event=lambda e: None,
                on_forecast=None,
                checkpoint=checkpoint,
                dedupe=dedupe,
            )
            self.assertTrue(result2.duplicate)


# ───── Colibri Metrics Bridge Tests ─────

class TestColibriMetrics(unittest.TestCase):
    """Test the ColibriMetrics schema bridge to TypeScript interfaces."""

    def test_colibri_metrics_dataclass(self) -> None:
        metrics = ColibriMetrics(
            memory=ColibriMemoryMetrics(used=50, total=256, wasm_heap=32, js_heap=18),
            inference=ColibriInferenceMetrics(tokens_per_second=15.5, latency_ms=42.0, batch_size=4),
            p2p=ColibriP2PMetrics(peers=3, download_mbps=12.5, upload_mbps=0.0,
                                  chunks_cached=128, cache_hit_rate=0.85),
            model=ColibriModelInfo(cid="QmHash", name="glm-5.2", loaded=True,
                                   quantization="q4_0", file_size=1024),
        )
        d = colibri_metrics_to_dict(metrics)
        self.assertIn("memory", d)
        self.assertIn("inference", d)
        self.assertIn("p2p", d)
        self.assertIn("model", d)
        self.assertEqual(d["model"]["name"], "glm-5.2")

    def test_peer_metrics_camelcase(self) -> None:
        pm = PeerMetrics(
            id="peer-1",
            region="global",
            type="fellowship",
            connected=True,
            download_mbps=10.0,
            upload_mbps=5.0,
            shared_chunks=42,
            last_seen=1234567890.0,
        )
        d = peer_metrics_to_dict(pm)
        self.assertEqual(d["downloadMbps"], 10.0)
        self.assertEqual(d["uploadMbps"], 5.0)
        self.assertEqual(d["sharedChunks"], 42)
        self.assertEqual(d["lastSeen"], 1234567890.0)
        self.assertEqual(d["type"], "fellowship")

    def test_chunk_metrics_camelcase(self) -> None:
        cm = ModelChunkMetrics(
            cid="QmHash",
            index=0,
            size=1024,
            status="cached",
            peer_count=3,
            download_speed=12.5,
            estimated_time=0.0,
        )
        d = chunk_metrics_to_dict(cm)
        self.assertEqual(d["peerCount"], 3)
        self.assertEqual(d["downloadSpeed"], 12.5)
        self.assertEqual(d["estimatedTime"], 0.0)

    def test_build_full_packet(self) -> None:
        """Test building a complete ColibriMetrics packet from events/forecasts."""
        now = datetime.now(timezone.utc)
        events = [
            PythiaEvent(
                event_id="evt-1",
                source_agent="agent-a",
                kind="evidence",
                title="E1",
                body="B1",
                timestamp=now,
            ),
        ]
        forecasts = [
            PythiaForecast(
                forecast_id="fc-1",
                agent_id="agent-b",
                hypothesis="Q",
                outcome="A",
                confidence=ForecastConfidence.HIGH,
                confidence_numeric=0.9,
            ),
        ]
        impacts = [
            ImpactAnalysis(
                target_id="evt-1",
                target_type="event",
                tier=ImpactTier.HIGH,
                score=0.8,
                affected_agents=["agent-a"],
                rationale="Test impact",
                generated_by="test",
            ),
        ]

        packet = build_colibri_metrics_packet(
            events=events,
            forecasts=forecasts,
            impacts=impacts,
            model_cid="QmHash123",
            model_name="glm-5.2",
            model_loaded=True,
        )

        self.assertIn("colibri", packet)
        self.assertIn("timestamp", packet)
        self.assertIn("peers", packet)
        self.assertIn("chunks", packet)
        self.assertIn("version", packet)

        colibri = packet["colibri"]
        self.assertEqual(colibri["model"]["name"], "glm-5.2")
        self.assertTrue(colibri["model"]["loaded"])

        # Should have at least 2 peers (agent-a, agent-b)
        self.assertGreaterEqual(len(packet["peers"]), 2)
        self.assertGreater(len(packet["chunks"]), 0)

    def test_event_to_peer_metrics(self) -> None:
        event = PythiaEvent(
            event_id="evt-1",
            source_agent="source-agent",
            kind="test",
            title="T",
            body="B",
        )
        pm = event_to_peer_metrics(event)
        self.assertEqual(pm.id, "source-agent")
        self.assertTrue(pm.connected)

    def test_forecast_to_peer_metrics(self) -> None:
        forecast = PythiaForecast(
            forecast_id="fc-1",
            agent_id="forecast-agent",
            hypothesis="Q",
            outcome="A",
            confidence=ForecastConfidence.MEDIUM,
        )
        pm = forecast_to_peer_metrics(forecast)
        self.assertEqual(pm.id, "forecast-agent")

    def test_impact_to_chunk_metrics(self) -> None:
        impact = ImpactAnalysis(
            target_id="evt-1",
            target_type="event",
            tier=ImpactTier.CRITICAL,
            score=0.9,
            affected_agents=["a1", "a2", "a3"],
            rationale="Critical impact",
            generated_by="test",
        )
        chunks = impact_to_chunk_metrics(impact)
        self.assertEqual(len(chunks), 3)
        for cm in chunks:
            self.assertEqual(cm.status, "cached")  # CRITICAL → cached


# ───── Pydantic / ColibriMetrics Typo Fix ─────

# Fix typo in test: "upload_mips" should be "upload_mbps"

    def test_colibri_metrics_with_typo_fixed(self) -> None:
        """Verify the P2P metrics field is upload_mbps not upload_mips."""
        metrics = ColibriInferenceMetrics(tokens_per_second=10.0, latency_ms=50.0, batch_size=2)
        self.assertEqual(metrics.tokens_per_second, 10.0)


# ───── Integration: Poller with Mock Client ─────

class TestPollerIntegration(unittest.TestCase):
    """Integration test: PythiaPoller with mock client."""

    def test_run_once_with_mock_client(self) -> None:
        from pythia_connector.poller import PythiaPoller, PollResult

        # Create a mock client
        mock_client = MagicMock()
        mock_client.get_events.return_value = []
        mock_client.get_forecasts.return_value = []
        mock_client.close = MagicMock()

        with tempfile.TemporaryDirectory() as tmpdir:
            checkpoint = CheckpointStore(path=Path(tmpdir) / ".checkpoint.json")
            poller = PythiaPoller(
                client=mock_client,
                checkpoint=checkpoint,
                agent_id="test-poller",
            )

            result = poller.run_once()
            self.assertIsInstance(result, PollResult)
            self.assertEqual(result.events_fetched, 0)
            self.assertEqual(result.forecasts_fetched, 0)
            self.assertEqual(len(result.errors), 0)

        mock_client.get_events.assert_called_once()
        mock_client.get_forecasts.assert_called_once()


if __name__ == "__main__":
    unittest.main(verbosity=2)
