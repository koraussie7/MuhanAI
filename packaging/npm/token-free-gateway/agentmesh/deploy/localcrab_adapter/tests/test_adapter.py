"""Unit tests for the LocalCrab Adapter package (36 tests)."""

import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch, call

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
)
from pythia_connector.colibri_metrics import ColibriMetrics

from localcrab_adapter.client import LocalCrabClient
from localcrab_adapter.mapper import (
    map_event_to_evidence,
    map_event_to_claim,
    map_forecast_to_claim,
    map_forecast_to_evidence,
    map_colibri_metrics,
    map_impact_tier,
    get_field_mapping,
)
from localcrab_adapter.evidence_writer import EvidenceWriter
from localcrab_adapter.graph_writer import GraphWriter
from localcrab_adapter.forecast_ledger import ForecastLedger
from localcrab_adapter.impact import ImpactAnalyzer


def make_event(**kwargs):
    defaults = dict(
        event_id="evt-evt-001",
        source_agent="agent-1",
        kind="research",
        title="Test Event",
        body="Something happened",
        severity="warning",
    )
    defaults.update(kwargs)
    return PythiaEvent(**defaults)


def make_forecast(**kwargs):
    defaults = dict(
        forecast_id="fc-evt-001",
        agent_id="agent-1",
        hypothesis="Will it rain?",
        outcome="Yes",
        confidence="high",
        confidence_numeric=0.85,
    )
    defaults.update(kwargs)
    return PythiaForecast(**defaults)


class TestMapper(unittest.TestCase):
    def test_map_event_to_evidence(self):
        event = make_event()
        evidence = map_event_to_evidence(event)
        self.assertEqual(evidence["eventId"], "evt-evt-001")
        self.assertEqual(evidence["type"], "research")
        self.assertEqual(evidence["content"], "Something happened")
        self.assertEqual(evidence["sourceAgent"], "agent-1")

    def test_map_event_to_evidence_severity_numeric(self):
        event = make_event(severity="critical")
        evidence = map_event_to_evidence(event)
        self.assertEqual(evidence["severity"], "critical")
        self.assertEqual(evidence["severityNumeric"], 2)

    def test_map_event_to_claim(self):
        event = make_event()
        claim = map_event_to_claim(event)
        self.assertEqual(claim["type"], "event_claim")
        self.assertEqual(claim["statement"], "Test Event")
        self.assertEqual(claim["sourceEventId"], "evt-evt-001")

    def test_map_event_to_claim_fatal_severity(self):
        event = make_event(severity="fatal")
        claim = map_event_to_claim(event)
        self.assertEqual(claim["confidence"], 1.0)

    def test_map_forecast_to_claim(self):
        forecast = make_forecast()
        claim = map_forecast_to_claim(forecast)
        self.assertEqual(claim["type"], "forecast_claim")
        self.assertEqual(claim["statement"], "Will it rain?")
        self.assertEqual(claim["outcome"], "Yes")
        self.assertEqual(claim["confidence"], 0.85)

    def test_map_forecast_to_evidence(self):
        forecast = make_forecast()
        evidence = map_forecast_to_evidence(forecast)
        self.assertEqual(evidence["eventId"], "fc-evt-001")
        self.assertEqual(evidence["type"], "forecast_prediction")
        self.assertIn("Will it rain?", evidence["content"])

    def test_map_colibri_metrics(self):
        metrics = ColibriMetrics(model_name="GLM-5.2", vocab_size=151552)
        mapped = map_colibri_metrics(metrics)
        self.assertEqual(mapped["modelName"], "GLM-5.2")
        self.assertEqual(mapped["vocabSize"], 151552)

    def test_map_impact_tier(self):
        result = map_impact_tier(ImpactTier.HIGH)
        self.assertEqual(result["tier"], "high")
        self.assertEqual(result["tierLevel"], 3)

    def test_get_field_mapping_event(self):
        m = get_field_mapping("event")
        self.assertEqual(m["event_id"], "eventId")

    def test_get_field_mapping_forecast(self):
        m = get_field_mapping("forecast")
        self.assertEqual(m["forecast_id"], "forecastId")

    def test_get_field_mapping_metrics(self):
        m = get_field_mapping("metrics")
        self.assertEqual(m["model_name"], "modelName")


class TestLocalCrabClient(unittest.TestCase):
    def test_client_init_defaults(self):
        client = LocalCrabClient()
        self.assertEqual(client.api_url, "http://localhost:8090")

    def test_client_init_custom(self):
        client = LocalCrabClient(api_url="http://custom:9090", api_key="key", timeout=20)
        self.assertEqual(client.api_url, "http://custom:9090")
        self.assertEqual(client.api_key, "key")
        self.assertEqual(client.timeout, 20.0)

    @patch("localcrab_adapter.client.LocalCrabClient._request")
    def test_submit_evidence(self, mock_req):
        mock_req.return_value = {"id": "ev-1"}
        client = LocalCrabClient()
        result = client.submit_evidence("evt-001", "type", "content")
        self.assertEqual(result["id"], "ev-1")

    @patch("localcrab_adapter.client.LocalCrabClient._request")
    def test_batch_submit_evidence(self, mock_req):
        mock_req.return_value = {"accepted": 2}
        client = LocalCrabClient()
        result = client.batch_submit_evidence([{"id": 1}, {"id": 2}])
        self.assertEqual(result["accepted"], 2)

    @patch("localcrab_adapter.client.LocalCrabClient._request")
    def test_create_claim(self, mock_req):
        mock_req.return_value = {"id": "claim-1"}
        client = LocalCrabClient()
        result = client.create_claim("test_claim", "Statement")
        self.assertEqual(result["id"], "claim-1")

    @patch("localcrab_adapter.client.LocalCrabClient._request")
    def test_create_claim_with_evidence(self, mock_req):
        mock_req.return_value = {"evidence": {"id": "e1"}, "claim": {"id": "c1"}}
        client = LocalCrabClient()
        result = client.create_claim_with_evidence("t", "s", "c", "ev")
        self.assertIn("evidence", result)
        self.assertIn("claim", result)

    @patch("localcrab_adapter.client.LocalCrabClient._request")
    def test_add_graph_edge(self, mock_req):
        mock_req.return_value = {"edge_id": "edge-1"}
        client = LocalCrabClient()
        result = client.add_graph_edge("s1", "t1", "supports")
        self.assertEqual(result["edge_id"], "edge-1")

    @patch("localcrab_adapter.client.LocalCrabClient._request")
    def test_get_claim(self, mock_req):
        mock_req.return_value = {"id": "c1", "type": "claim"}
        client = LocalCrabClient()
        result = client.get_claim("c1")
        self.assertEqual(result["id"], "c1")

    @patch("localcrab_adapter.client.LocalCrabClient._request")
    def test_get_evidence(self, mock_req):
        mock_req.return_value = {"id": "e1"}
        client = LocalCrabClient()
        result = client.get_evidence("e1")
        self.assertEqual(result["id"], "e1")

    @patch("localcrab_adapter.client.LocalCrabClient._request")
    def test_health(self, mock_req):
        mock_req.return_value = {"status": "ok"}
        client = LocalCrabClient()
        result = client.health()
        self.assertEqual(result["status"], "ok")

    def test_close(self):
        client = LocalCrabClient()
        client.close()


class TestEvidenceWriter(unittest.TestCase):
    @patch("localcrab_adapter.client.LocalCrabClient._request")
    def test_write_event_buffers(self, mock_req):
        client = LocalCrabClient()
        writer = EvidenceWriter(client, batch_size=5)
        event = make_event(event_id="evt-evt-001")
        result = writer.write_event(event)
        self.assertIsNone(result)
        self.assertEqual(writer.buffer_size, 1)

    @patch("localcrab_adapter.client.LocalCrabClient._request")
    def test_write_event_flushes_batch(self, mock_req):
        mock_req.return_value = {"accepted": 3}
        client = LocalCrabClient()
        writer = EvidenceWriter(client, batch_size=3)
        writer.write_event(make_event(event_id="evt-evt-001"))
        writer.write_event(make_event(event_id="evt-evt-002"))
        result = writer.write_event(make_event(event_id="evt-evt-003"))
        self.assertIsNotNone(result)

    @patch("localcrab_adapter.client.LocalCrabClient._request")
    def test_flush_empty_buffer(self, mock_req):
        client = LocalCrabClient()
        writer = EvidenceWriter(client)
        result = writer.flush()
        self.assertIsNone(result)

    @patch("localcrab_adapter.client.LocalCrabClient._request")
    def test_write_forecast(self, mock_req):
        mock_req.return_value = {"accepted": 1}
        client = LocalCrabClient()
        writer = EvidenceWriter(client, batch_size=1)
        writer.write_forecast(make_forecast())
        self.assertEqual(writer.flushed_count, 1)

    @patch("localcrab_adapter.client.LocalCrabClient._request")
    def test_context_manager(self, mock_req):
        mock_req.return_value = {"accepted": 1}
        client = LocalCrabClient()
        with EvidenceWriter(client, batch_size=1) as writer:
            writer.write_event(make_event())
        self.assertEqual(writer.flushed_count, 1)


class TestGraphWriter(unittest.TestCase):
    @patch("localcrab_adapter.client.LocalCrabClient._request")
    def test_add_edge(self, mock_req):
        mock_req.return_value = {"edge_id": "e1"}
        client = LocalCrabClient()
        gw = GraphWriter(client)
        result = gw.add_edge("s", "t", "supports")
        self.assertEqual(result["edge_id"], "e1")

    @patch("localcrab_adapter.client.LocalCrabClient._request")
    def test_supports(self, mock_req):
        mock_req.return_value = {}
        client = LocalCrabClient()
        gw = GraphWriter(client)
        gw.supports("ev-1", "cl-1")
        self.assertEqual(gw.edge_count, 1)

    @patch("localcrab_adapter.client.LocalCrabClient._request")
    def test_derived_from(self, mock_req):
        mock_req.return_value = {}
        client = LocalCrabClient()
        gw = GraphWriter(client)
        gw.derived_from("cl-1", "ev-1")
        self.assertEqual(gw.edge_count, 1)

    @patch("localcrab_adapter.client.LocalCrabClient._request")
    def test_impacts(self, mock_req):
        mock_req.return_value = {}
        client = LocalCrabClient()
        gw = GraphWriter(client)
        gw.impacts("ev-1", "agent-1", impact_score=0.8)
        self.assertEqual(gw.edge_count, 1)

    @patch("localcrab_adapter.client.LocalCrabClient._request")
    def test_bulk_edges(self, mock_req):
        mock_req.return_value = {}
        client = LocalCrabClient()
        gw = GraphWriter(client)
        edges = [
            ("s1", "t1", "supports", None),
            ("s2", "t2", "impacts", {"score": 0.5}),
        ]
        results = gw.bulk_edges(edges)
        self.assertEqual(len(results), 2)


class TestForecastLedger(unittest.TestCase):
    @patch("localcrab_adapter.client.LocalCrabClient._request")
    def test_register_forecast(self, mock_req):
        mock_req.side_effect = [{"id": "ev-1"}, {"id": "c1"}, {}]
        client = LocalCrabClient()
        ledger = ForecastLedger(client)
        result = ledger.register_forecast(make_forecast())
        self.assertIn("evidence", result)
        self.assertEqual(ledger.registered_count, 1)

    @patch("localcrab_adapter.client.LocalCrabClient._request")
    def test_get_claim_id_from_cache(self, mock_req):
        client = LocalCrabClient()
        ledger = ForecastLedger(client)
        ledger._ledger["fc-001"] = "claim-1"
        self.assertEqual(ledger.get_claim_id("fc-001"), "claim-1")

    @patch("localcrab_adapter.client.LocalCrabClient._request")
    def test_get_forecast_id_from_cache(self, mock_req):
        client = LocalCrabClient()
        ledger = ForecastLedger(client)
        ledger._reverse["claim-1"] = "fc-001"
        self.assertEqual(ledger.get_forecast_id("claim-1"), "fc-001")

    @patch("localcrab_adapter.client.LocalCrabClient._request")
    def test_link_forecasts(self, mock_req):
        mock_req.return_value = {}
        client = LocalCrabClient()
        ledger = ForecastLedger(client)
        ledger.link_forecasts("fc-001", "cl-1")
        self.assertEqual(ledger.graph_writer.edge_count, 1)

    @patch("localcrab_adapter.client.LocalCrabClient._request")
    def test_get_claim_id_not_found(self, mock_req):
        client = LocalCrabClient()
        ledger = ForecastLedger(client)
        self.assertIsNone(ledger.get_forecast_id("unknown-claim"))


class TestImpactAnalyzer(unittest.TestCase):
    def test_compute_event_impact(self):
        analyzer = ImpactAnalyzer()
        impact = analyzer.compute_event_impact(make_event(severity="warning"))
        self.assertEqual(impact["target_type"], "event")
        self.assertIn(impact["tier"], ["low", "medium", "high", "critical"])

    def test_compute_event_impact_fatal(self):
        analyzer = ImpactAnalyzer()
        impact = analyzer.compute_event_impact(make_event(severity="fatal"))
        self.assertEqual(impact["tier"], "critical")

    def test_compute_forecast_impact(self):
        analyzer = ImpactAnalyzer()
        impact = analyzer.compute_forecast_impact(make_forecast())
        self.assertEqual(impact["target_type"], "forecast")
        self.assertIn(impact["tier"], ["low", "medium", "high", "critical"])

    def test_compute_forecast_impact_low_confidence(self):
        analyzer = ImpactAnalyzer()
        forecast = make_forecast(
            confidence="low",
            confidence_numeric=0.2,
        )
        impact = analyzer.compute_forecast_impact(forecast)
        self.assertEqual(impact["tier"], "low")

    def test_tier_from_score(self):
        analyzer = ImpactAnalyzer()
        self.assertEqual(analyzer.tier_from_score(0.8).value, "critical")
        self.assertEqual(analyzer.tier_from_score(0.6).value, "high")
        self.assertEqual(analyzer.tier_from_score(0.3).value, "medium")
        self.assertEqual(analyzer.tier_from_score(0.05).value, "low")

    def test_analysis_count(self):
        analyzer = ImpactAnalyzer()
        analyzer.compute_event_impact(make_event(event_id="evt-evt-001"))
        analyzer.compute_event_impact(make_event(event_id="evt-evt-002"))
        self.assertEqual(analyzer.analysis_count, 2)


if __name__ == "__main__":
    unittest.main()
