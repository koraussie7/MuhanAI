"""Unit tests for the Pythia Connector package (61 tests)."""

import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch, mock_open

# Ensure deploy/ is on the path when running from there
deploy_dir = Path(__file__).resolve().parents[3]
if str(deploy_dir) not in sys.path:
    sys.path.insert(0, str(deploy_dir))

from pythia_connector.models import (
    EventSeverity,
    ForecastConfidence,
    ImpactTier,
    PythiaEvent,
    PythiaForecast,
    CheckpointState,
    WebhookPayload,
)
from pythia_connector.retry import with_retry
from pythia_connector.dedupe import Deduper, content_hash
from pythia_connector.checkpoint import CheckpointManager
from pythia_connector.normalizer import (
    normalize_event,
    normalize_forecast,
    normalize_webhook_payload,
    normalize_event_batch,
    normalize_forecast_batch,
    extract_metadata_value,
    severity_to_numeric,
    confidence_to_numeric,
)
from pythia_connector.client import PythiaClient
from pythia_connector.colibri_metrics import ColibriMetrics, PeerMetrics, ModelChunkMetrics


class TestEventSeverity(unittest.TestCase):
    def test_event_severity_values(self):
        self.assertEqual(EventSeverity.INFO.value, "info")
        self.assertEqual(EventSeverity.WARNING.value, "warning")
        self.assertEqual(EventSeverity.CRITICAL.value, "critical")
        self.assertEqual(EventSeverity.FATAL.value, "fatal")


class TestForecastConfidence(unittest.TestCase):
    def test_forecast_confidence_values(self):
        self.assertEqual(ForecastConfidence.LOW.value, "low")
        self.assertEqual(ForecastConfidence.MEDIUM.value, "medium")
        self.assertEqual(ForecastConfidence.HIGH.value, "high")
        self.assertEqual(ForecastConfidence.CERTAIN.value, "certain")


class TestImpactTier(unittest.TestCase):
    def test_impact_tier_values(self):
        self.assertEqual(ImpactTier.LOW.value, "low")
        self.assertEqual(ImpactTier.MEDIUM.value, "medium")
        self.assertEqual(ImpactTier.HIGH.value, "high")
        self.assertEqual(ImpactTier.CRITICAL.value, "critical")


class TestPythiaEvent(unittest.TestCase):
    def test_pythia_event_creation(self):
        event = PythiaEvent(
            event_id="evt-001",
            source_agent="agent-1",
            kind="research_update",
            title="New finding",
            body="Discovered something interesting",
        )
        self.assertEqual(event.event_id, "evt-001")
        self.assertEqual(event.severity, EventSeverity.INFO)
        self.assertEqual(event.schema_version, "1.0.0")

    def test_pythia_event_validation_short_id(self):
        with self.assertRaises(ValueError):
            PythiaEvent(event_id="ab", source_agent="a", kind="k", title="t", body="b")

    def test_pythia_event_extra_fields_ignored(self):
        event = PythiaEvent(
            event_id="evt-002",
            source_agent="agent-1",
            kind="update",
            title="T",
            body="B",
            unknown_field="ignored",
        )
        self.assertFalse(hasattr(event, "unknown_field"))

    def test_pythia_event_default_timestamp(self):
        event = PythiaEvent(
            event_id="evt-003",
            source_agent="a",
            kind="k",
            title="T",
            body="B",
        )
        self.assertIsNotNone(event.timestamp)


class TestPythiaForecast(unittest.TestCase):
    def test_pythia_forecast_creation(self):
        forecast = PythiaForecast(
            forecast_id="fc-001",
            agent_id="agent-1",
            hypothesis="Will it rain",
            outcome="Yes",
            confidence=ForecastConfidence.HIGH,
        )
        self.assertEqual(forecast.forecast_id, "fc-001")
        self.assertIsNone(forecast.resolved_at)

    def test_pythia_forecast_confidence_numeric_downgrade(self):
        forecast = PythiaForecast(
            forecast_id="fc-002",
            agent_id="agent-1",
            hypothesis="Q",
            outcome="A",
            confidence=ForecastConfidence.HIGH,
            confidence_numeric=0.65,
        )
        self.assertEqual(forecast.confidence, ForecastConfidence.MEDIUM)

    def test_pythia_forecast_supporting_events_default(self):
        forecast = PythiaForecast(
            forecast_id="fc-003",
            agent_id="a",
            hypothesis="H",
            outcome="O",
            confidence=ForecastConfidence.LOW,
        )
        self.assertEqual(forecast.supporting_events, [])


class TestCheckpointState(unittest.TestCase):
    def test_checkpoint_state_defaults(self):
        state = CheckpointState()
        self.assertIsNone(state.last_event_id)
        self.assertEqual(state.processed_event_ids, set())
        self.assertEqual(state.seen_forecast_ids, set())

    def test_checkpoint_state_version(self):
        state = CheckpointState()
        self.assertEqual(state.version, "1.0.0")


class TestWebhookPayload(unittest.TestCase):
    def test_webhook_payload_alias(self):
        payload = WebhookPayload(
            eventType="test",
            timestamp="2026-10-07T00:00:00Z",
            source="agent",
            data={"key": "value"},
        )
        self.assertEqual(payload.event_type, "test")
        self.assertEqual(payload.source, "agent")

    def test_webhook_payload_signature(self):
        payload = WebhookPayload(
            eventType="evt",
            timestamp="2026-10-07T00:00:00Z",
            source="s",
            signature="sig123",
        )
        self.assertEqual(payload.signature, "sig123")


class TestRetryDecorator(unittest.TestCase):
    def test_retry_success_first_try(self):
        call_count = [0]

        @with_retry(max_attempts=3)
        def func():
            call_count[0] += 1
            return "ok"

        result = func()
        self.assertEqual(result, "ok")
        self.assertEqual(call_count[0], 1)

    def test_retry_succeeds_after_failures(self):
        call_count = [0]

        @with_retry(max_attempts=5, base_delay=0.01, jitter=False)
        def func():
            call_count[0] += 1
            if call_count[0] < 3:
                raise ConnectionError("transient")
            return "ok"

        result = func()
        self.assertEqual(result, "ok")
        self.assertEqual(call_count[0], 3)

    def test_retry_max_attempts_exceeded(self):
        call_count = [0]

        @with_retry(max_attempts=3, base_delay=0.01, jitter=False)
        def func():
            call_count[0] += 1
            raise TimeoutError("always fails")

        with self.assertRaises(TimeoutError):
            func()
        self.assertEqual(call_count[0], 3)

    def test_retry_wrong_exception_not_retried(self):
        call_count = [0]

        @with_retry(max_attempts=3, exceptions=(ValueError,))
        def func():
            call_count[0] += 1
            raise TypeError("not retried")

        with self.assertRaises(TypeError):
            func()
        self.assertEqual(call_count[0], 1)

    def test_retry_preserves_return_value(self):
        @with_retry(max_attempts=3)
        def func():
            return {"data": [1, 2, 3]}

        result = func()
        self.assertEqual(result, {"data": [1, 2, 3]})


class TestContentHash(unittest.TestCase):
    def test_content_hash_dict(self):
        h1 = content_hash({"a": 1, "b": 2})
        h2 = content_hash({"b": 2, "a": 1})
        self.assertEqual(h1, h2)

    def test_content_hash_string(self):
        h1 = content_hash("hello")
        h2 = content_hash("hello")
        self.assertEqual(h1, h2)

    def test_content_hash_different_inputs(self):
        h1 = content_hash("hello")
        h2 = content_hash("world")
        self.assertNotEqual(h1, h2)

    def test_content_hash_bytes(self):
        h1 = content_hash(b"binary data")
        h2 = content_hash(b"binary data")
        self.assertEqual(h1, h2)


class TestDeduper(unittest.TestCase):
    def test_deduper_is_duplicate(self):
        d = Deduper()
        data = {"id": "x"}
        self.assertFalse(d.is_duplicate(data))
        d.add(data)
        self.assertTrue(d.is_duplicate(data))

    def test_deduper_add(self):
        d = Deduper()
        h = d.add({"id": "x"})
        self.assertEqual(len(h), 64)

    def test_deduper_is_new(self):
        d = Deduper()
        self.assertTrue(d.is_new({"id": "x"}))
        self.assertFalse(d.is_new({"id": "x"}))

    def test_deduper_filter_new(self):
        d = Deduper()
        items = [{"id": "a"}, {"id": "b"}, {"id": "a"}]
        new = d.filter_new(items)
        self.assertEqual(len(new), 2)

    def test_deduper_seen_count(self):
        d = Deduper()
        d.add({"id": "a"})
        d.add({"id": "b"})
        self.assertEqual(d.seen_count, 2)

    def test_deduper_merge_hashes(self):
        d = Deduper()
        d.merge_hashes({"hash1", "hash2"})
        self.assertEqual(d.seen_count, 2)


class TestCheckpointManager(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.path = os.path.join(self.tmpdir, "checkpoint.json")

    def test_checkpoint_load_default(self):
        mgr = CheckpointManager(self.path)
        state = mgr.load()
        self.assertIsNone(state.last_event_id)
        self.assertEqual(state.processed_event_ids, set())

    def test_checkpoint_save_and_load(self):
        mgr = CheckpointManager(self.path)
        state = CheckpointState(last_event_id="evt-999")
        mgr.save(state)
        loaded = mgr.load()
        self.assertEqual(loaded.last_event_id, "evt-999")

    def test_checkpoint_update(self):
        mgr = CheckpointManager(self.path)
        state = mgr.update(
            last_event_id="evt-100",
            processed_event_ids={"evt-100"},
        )
        self.assertEqual(state.last_event_id, "evt-100")
        self.assertIn("evt-100", state.processed_event_ids)

    def test_checkpoint_has_processed(self):
        mgr = CheckpointManager(self.path)
        mgr.update(last_event_id="evt-1", processed_event_ids={"evt-1"})
        self.assertTrue(mgr.has_processed("evt-1"))
        self.assertFalse(mgr.has_processed("evt-2"))

    def test_checkpoint_update_forecast_ids(self):
        mgr = CheckpointManager(self.path)
        mgr.update(seen_forecast_ids={"fc-1", "fc-2"})
        state = mgr.load()
        self.assertIn("fc-1", state.seen_forecast_ids)
        self.assertIn("fc-2", state.seen_forecast_ids)

    def test_checkpoint_to_dict(self):
        mgr = CheckpointManager(self.path)
        mgr.update(last_event_id="evt-1", processed_event_ids={"evt-1"})
        d = mgr.to_dict()
        self.assertEqual(d["last_event_id"], "evt-1")


class TestNormalizer(unittest.TestCase):
    def test_normalize_event_basic(self):
        raw = {
            "event_id": "evt-001",
            "source_agent": "agent-1",
            "kind": "update",
            "title": "Test",
            "body": "Body text",
        }
        event = normalize_event(raw)
        self.assertEqual(event.event_id, "evt-001")
        self.assertEqual(event.source_agent, "agent-1")

    def test_normalize_event_field_variations(self):
        raw = {
            "id": "evt-002",
            "agent": "agent-2",
            "type": "alert",
            "summary": "Summary",
            "description": "Desc",
        }
        event = normalize_event(raw)
        self.assertEqual(event.event_id, "evt-002")
        self.assertEqual(event.source_agent, "agent-2")
        self.assertEqual(event.kind, "alert")

    def test_normalize_forecast_basic(self):
        raw = {
            "forecast_id": "fc-001",
            "agent_id": "agent-1",
            "hypothesis": "Will it rain?",
            "outcome": "Yes",
            "confidence": "high",
        }
        forecast = normalize_forecast(raw)
        self.assertEqual(forecast.forecast_id, "fc-001")
        self.assertEqual(forecast.confidence, ForecastConfidence.HIGH)

    def test_normalize_forecast_field_variations(self):
        raw = {
            "id": "fc-002",
            "agent": "agent-2",
            "question": "Q?",
            "prediction": "A",
            "confidence": "medium",
        }
        forecast = normalize_forecast(raw)
        self.assertEqual(forecast.forecast_id, "fc-002")
        self.assertEqual(forecast.confidence, ForecastConfidence.MEDIUM)

    def test_normalize_webhook_payload(self):
        raw = {
            "eventType": "forecast_created",
            "timestamp": "2026-10-07T00:00:00Z",
            "source": "agent-1",
            "data": {"forecast_id": "fc-001"},
        }
        payload = normalize_webhook_payload(raw)
        self.assertEqual(payload.event_type, "forecast_created")
        self.assertEqual(payload.source, "agent-1")

    def test_normalize_event_batch(self):
        raw_events = [
            {"event_id": "evt-001", "source_agent": "a", "kind": "k", "title": "T", "body": "B"},
            {"bad": "data"},
        ]
        events = normalize_event_batch(raw_events)
        self.assertEqual(len(events), 1)

    def test_normalize_forecast_batch(self):
        raw = [
            {"forecast_id": "fc-001", "agent_id": "a", "hypothesis": "H", "outcome": "O", "confidence": "low"},
        ]
        forecasts = normalize_forecast_batch(raw)
        self.assertEqual(len(forecasts), 1)


class TestSeverityConfidenceHelpers(unittest.TestCase):
    def test_severity_to_numeric(self):
        self.assertEqual(severity_to_numeric(EventSeverity.INFO), 0)
        self.assertEqual(severity_to_numeric(EventSeverity.FATAL), 3)

    def test_severity_to_numeric_string(self):
        self.assertEqual(severity_to_numeric("critical"), 2)

    def test_confidence_to_numeric(self):
        self.assertEqual(confidence_to_numeric(ForecastConfidence.CERTAIN), 1.0)
        self.assertEqual(confidence_to_numeric(ForecastConfidence.LOW), 0.4)

    def test_confidence_to_numeric_none(self):
        self.assertIsNone(confidence_to_numeric(None))

    def test_confidence_to_numeric_float(self):
        self.assertEqual(confidence_to_numeric(0.75), 0.75)


class TestColibriMetrics(unittest.TestCase):
    def test_colibri_metrics_to_dict(self):
        m = ColibriMetrics(model_name="GLM-5.2", vocab_size=151552)
        d = m.to_dict()
        self.assertEqual(d["modelName"], "GLM-5.2")
        self.assertEqual(d["vocabSize"], 151552)

    def test_colibri_metrics_from_dict(self):
        data = {"modelName": "GLM-5.2", "vocabSize": 1000, "tokensGenerated": 42}
        m = ColibriMetrics.from_dict(data)
        self.assertEqual(m.model_name, "GLM-5.2")
        self.assertEqual(m.tokens_generated, 42)

    def test_peer_metrics_to_dict(self):
        p = PeerMetrics(peer_id="peer-1", status="online")
        d = p.to_dict()
        self.assertEqual(d["peerId"], "peer-1")
        self.assertEqual(d["status"], "online")

    def test_peer_metrics_from_dict(self):
        data = {"peerId": "peer-2", "status": "offline", "region": "us-east"}
        p = PeerMetrics.from_dict(data)
        self.assertEqual(p.peer_id, "peer-2")
        self.assertEqual(p.region, "us-east")

    def test_model_chunk_metrics_to_dict(self):
        m = ModelChunkMetrics(model_cid="bafy123", total_chunks=5, chunks_served=3)
        d = m.to_dict()
        self.assertEqual(d["modelCid"], "bafy123")
        self.assertEqual(d["totalChunks"], 5)

    def test_model_chunk_metrics_from_dict(self):
        data = {"modelCid": "c1", "totalChunks": 10, "chunksServed": 5, "chunkSizeMB": 256.0}
        m = ModelChunkMetrics.from_dict(data)
        self.assertEqual(m.total_chunks, 10)
        self.assertEqual(m.chunk_size_mb, 256.0)


class TestPythiaClient(unittest.TestCase):
    def test_client_init_defaults(self):
        client = PythiaClient()
        self.assertEqual(client.api_url, "http://localhost:3002")
        self.assertIsNone(client.api_key)

    def test_client_init_custom(self):
        client = PythiaClient(api_url="http://custom:8080", api_key="key", timeout=20)
        self.assertEqual(client.api_url, "http://custom:8080")
        self.assertEqual(client.api_key, "key")
        self.assertEqual(client.timeout, 20.0)

    def test_client_base_url(self):
        client = PythiaClient(api_url="http://example.com/")
        self.assertEqual(client.base_url, "http://example.com")

    @patch("pythia_connector.client.PythiaClient._request")
    def test_client_get_events(self, mock_req):
        mock_req.return_value = {"events": [{"event_id": "evt-001", "source_agent": "a", "kind": "k", "title": "T", "body": "B"}]}
        client = PythiaClient()
        events = client.get_events(limit=10)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].event_id, "evt-001")

    @patch("pythia_connector.client.PythiaClient._request")
    def test_client_get_event_not_found(self, mock_req):
        import requests
        resp = requests.Response()
        resp.status_code = 404
        mock_req.side_effect = requests.HTTPError(response=resp)
        client = PythiaClient()
        self.assertIsNone(client.get_event("nonexistent"))

    @patch("pythia_connector.client.PythiaClient._request")
    def test_client_get_forecasts(self, mock_req):
        mock_req.return_value = {"forecasts": [{"forecast_id": "fc-001", "agent_id": "a", "hypothesis": "H", "outcome": "O", "confidence": "medium"}]}
        client = PythiaClient()
        forecasts = client.get_forecasts(limit=10)
        self.assertEqual(len(forecasts), 1)

    @patch("pythia_connector.client.PythiaClient._request")
    def test_client_get_forecast_not_found(self, mock_req):
        import requests
        resp = requests.Response()
        resp.status_code = 404
        mock_req.side_effect = requests.HTTPError(response=resp)
        client = PythiaClient()
        self.assertIsNone(client.get_forecast("nonexistent"))

    @patch("pythia_connector.client.PythiaClient._request")
    def test_client_health(self, mock_req):
        mock_req.return_value = {"status": "ok"}
        client = PythiaClient()
        health = client.health()
        self.assertEqual(health["status"], "ok")

    @patch("pythia_connector.client.PythiaClient._request")
    def test_client_get_events_empty(self, mock_req):
        mock_req.return_value = {"events": []}
        client = PythiaClient()
        events = client.get_events()
        self.assertEqual(len(events), 0)

    def test_client_close(self):
        client = PythiaClient()
        client.close()


class TestColibriMetricsIntegration(unittest.TestCase):
    def test_metrics_round_trip(self):
        m = ColibriMetrics(model_name="Kimi K3", model_cid="cid1", tokens_generated=100)
        d = m.to_dict()
        m2 = ColibriMetrics.from_dict(d)
        self.assertEqual(m.model_name, m2.model_name)
        self.assertEqual(m.tokens_generated, m2.tokens_generated)

    def test_extract_metadata_value(self):
        event = PythiaEvent(
            event_id="evt-001",
            source_agent="a",
            kind="k",
            title="T",
            body="B",
            metadata={"key1": "val1", "key2": 42},
        )
        self.assertEqual(extract_metadata_value(event, "key1"), "val1")
        self.assertIsNone(extract_metadata_value(event, "missing"))
        self.assertEqual(extract_metadata_value(event, "missing", "default"), "default")


class TestCheckpointPersistence(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.path = os.path.join(self.tmpdir, "checkpoint.json")

    def test_checkpoint_persistence(self):
        mgr = CheckpointManager(self.path)
        mgr.update(last_event_id="evt-1", processed_event_ids={"evt-1"})
        mgr2 = CheckpointManager(self.path)
        state = mgr2.load()
        self.assertEqual(state.last_event_id, "evt-1")
        self.assertIn("evt-1", state.processed_event_ids)


class TestDedupeWithCheckpoint(unittest.TestCase):
    def test_dedupe_matches_checkpoint(self):
        d = Deduper()
        data = {"event_id": "x"}
        h = d.add(data)
        self.assertTrue(d.is_duplicate(data))
        state = CheckpointState()
        state.processed_event_ids = {"x"}
        self.assertIn("x", state.processed_event_ids)


if __name__ == "__main__":
    unittest.main()
