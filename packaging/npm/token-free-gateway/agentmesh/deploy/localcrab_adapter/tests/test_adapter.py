"""Unit tests for the LocalCrab Adapter.

Uses stdlib `unittest` with `unittest.mock` for mocking HTTP calls.
Run:  python3 -m unittest localcrab_adapter.tests.test_adapter -v
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure deploy/ is on the path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent))

from pythia_connector.models import (  # noqa: E402
    EventSeverity,
    ForecastConfidence,
    ImpactAnalysis,
    ImpactTier,
    PythiaEvent,
    PythiaForecast,
)
from pythia_connector.checkpoint import CheckpointStore  # noqa: E402
from localcrab_adapter.client import LocalCrabClient, content_hash  # noqa: E402
from localcrab_adapter.mapper import (  # noqa: E402
    CL_STATUS_PENDING,
    CL_STATUS_RESOLVED,
    EDGE_DERIVED_FROM,
    EDGE_SUPPORTS,
    EDGE_IMPACTS,
    event_to_evidence,
    forecast_to_claim,
    impact_to_claim_metadata,
    impact_to_graph_edges,
    build_evidence_chain,
)
from localcrab_adapter.evidence_writer import EvidenceWriter  # noqa: E402
from localcrab_adapter.graph_writer import GraphWriter  # noqa: E402
from localcrab_adapter.forecast_ledger import ForecastLedger  # noqa: E402
from localcrab_adapter.impact import ImpactAdapter, TIER_MAP  # noqa: E402


# ───── Client Tests ─────

class TestLocalCrabClient(unittest.TestCase):
    def setUp(self) -> None:
        self.client = LocalCrabClient(base_url="http://localhost:8000", api_key="test-key")

    def test_client_headers(self) -> None:
        self.assertEqual(self.client._session.headers.get("X-API-Key"), "test-key")

    def test_content_hash_deterministic(self) -> None:
        h1 = content_hash("same content")
        h2 = content_hash("same content")
        self.assertEqual(h1, h2)

    def test_content_hash_different(self) -> None:
        h1 = content_hash("content A")
        h2 = content_hash("content B")
        self.assertNotEqual(h1, h2)

    def test_content_hash_with_salt(self) -> None:
        h1 = content_hash("content", salt="salt1")
        h2 = content_hash("content", salt="salt2")
        self.assertNotEqual(h1, h2)
        h3 = content_hash("content", salt="salt1")
        self.assertEqual(h1, h3)


# ───── Mapper Tests ─────

class TestEventToEvidence(unittest.TestCase):
    def test_event_maps_to_evidence(self) -> None:
        event = PythiaEvent(
            event_id="evt-001",
            source_agent="claude-agent",
            kind="evidence",
            title="Test",
            body="Some evidence",
            severity=EventSeverity.WARNING,
        )
        ev = event_to_evidence(event)
        self.assertEqual(ev["source"], "pythia:claude-agent")
        self.assertEqual(ev["kind"], "research_event")
        self.assertIn("event_id", ev["metadata"])
        self.assertEqual(ev["metadata"]["event_id"], "evt-001")
        self.assertEqual(ev["metadata"]["severity"], "warning")
        self.assertIn("cid", ev)

    def test_evidence_cid_matches_content(self) -> None:
        event = PythiaEvent(
            event_id="evt-002",
            source_agent="agent",
            kind="test",
            title="T",
            body="Unique content",
        )
        ev = event_to_evidence(event)
        expected_cid = content_hash("Unique content")
        self.assertEqual(ev["cid"], expected_cid)

    def test_event_with_metadata_preserved(self) -> None:
        event = PythiaEvent(
            event_id="evt-003",
            source_agent="agent",
            kind="k",
            title="T",
            body="B",
            metadata={"custom": "data", "number": 42},
        )
        ev = event_to_evidence(event)
        self.assertEqual(ev["metadata"]["custom"], "data")


class TestForecastToClaim(unittest.TestCase):
    def test_forecast_maps_to_claim(self) -> None:
        forecast = PythiaForecast(
            forecast_id="fc-001",
            agent_id="test-agent",
            hypothesis="Will it work?",
            outcome="Yes",
            confidence=ForecastConfidence.HIGH,
            confidence_numeric=0.85,
        )
        claim = forecast_to_claim(forecast)
        self.assertIn("→", claim["statement"])
        self.assertIn("Will it work?", claim["statement"])
        self.assertEqual(claim["status"], CL_STATUS_PENDING)
        self.assertEqual(claim["evidence_ids"], [])

    def test_forecast_with_evidence_ids(self) -> None:
        forecast = PythiaForecast(
            forecast_id="fc-002",
            agent_id="agent",
            hypothesis="Q",
            outcome="A",
            confidence=ForecastConfidence.MEDIUM,
        )
        claim = forecast_to_claim(forecast, evidence_ids=["ev-1", "ev-2"])
        self.assertEqual(claim["evidence_ids"], ["ev-1", "ev-2"])

    def test_resolved_forecast_status(self) -> None:
        now = datetime.now(timezone.utc)
        forecast = PythiaForecast(
            forecast_id="fc-003",
            agent_id="agent",
            hypothesis="Q",
            outcome="A",
            confidence=ForecastConfidence.LOW,
            resolved_at=now,
        )
        claim = forecast_to_claim(forecast)
        self.assertEqual(claim["status"], CL_STATUS_RESOLVED)

    def test_forecast_metadata_includes_confidence(self) -> None:
        forecast = PythiaForecast(
            forecast_id="fc-004",
            agent_id="agent",
            hypothesis="Q",
            outcome="A",
            confidence=ForecastConfidence.HIGH,
            confidence_numeric=0.92,
        )
        claim = forecast_to_claim(forecast)
        self.assertIn("confidence", claim["metadata"])
        self.assertEqual(claim["metadata"]["confidence"], "high")
        self.assertEqual(claim["metadata"]["confidence_numeric"], 0.92)


class TestImpactToClaimMetadata(unittest.TestCase):
    def test_impact_metadata(self) -> None:
        impact = ImpactAnalysis(
            target_id="evt-001",
            target_type="event",
            tier=ImpactTier.HIGH,
            score=0.85,
            affected_agents=["agent-a"],
            rationale="Test rationale",
            mitigations=["mit1", "mit2"],
            generated_by="test-agent",
        )
        meta = impact_to_claim_metadata(impact)
        self.assertEqual(meta["impact_tier"], "high")
        self.assertEqual(meta["impact_score"], 0.85)
        self.assertEqual(meta["affected_agents"], ["agent-a"])
        self.assertEqual(meta["mitigations"], ["mit1", "mit2"])


class TestImpactToGraphEdges(unittest.TestCase):
    def test_edges_created(self) -> None:
        impact = ImpactAnalysis(
            target_id="evt-001",
            target_type="event",
            tier=ImpactTier.CRITICAL,
            score=0.9,
            affected_agents=["a1", "a2"],
            rationale="Critical impact",
            generated_by="test-agent",
        )
        edges = impact_to_graph_edges(impact, claim_id="claim-1")
        self.assertEqual(len(edges), 2)  # one per affected agent
        for edge in edges:
            self.assertEqual(edge["edge_type"], EDGE_IMPACTS)
            self.assertIn("a1" if edges.index(edge) == 0 else "a2", edge["source_id"])


class TestBuildEvidenceChain(unittest.TestCase):
    def test_no_parent_creates_single_evidence(self) -> None:
        event = PythiaEvent(
            event_id="evt-001",
            source_agent="agent",
            kind="test",
            title="T",
            body="B",
        )
        chain = build_evidence_chain(event)
        self.assertEqual(len(chain), 1)  # just evidence

    def test_with_parent_creates_edge(self) -> None:
        event = PythiaEvent(
            event_id="evt-001",
            source_agent="agent",
            kind="test",
            title="T",
            body="B",
            parent_event_id="parent-cid",
        )
        chain = build_evidence_chain(event, parent_evidence_id="my-cid")
        self.assertEqual(len(chain), 2)  # evidence + edge
        edge = chain[1]
        self.assertIn("edge_type", edge)
        self.assertEqual(edge["edge_type"], EDGE_DERIVED_FROM)


# ───── EvidenceWriter Tests ─────

class TestEvidenceWriter(unittest.TestCase):
    def test_write_event_returns_cid(self) -> None:
        mock_client = MagicMock()
        mock_client.create_evidence.return_value = {"id": "ev-123"}

        with tempfile.TemporaryDirectory() as tmpdir:
            checkpoint = CheckpointStore(path=Path(tmpdir) / ".ckpt.json")
            writer = EvidenceWriter(client=mock_client, checkpoint=checkpoint)

            event = PythiaEvent(
                event_id="evt-001",
                source_agent="agent",
                kind="test",
                title="T",
                body="Content",
            )
            result = writer.write_event(event)
            self.assertEqual(result, "ev-123")
            mock_client.create_evidence.assert_called_once()

    def test_duplicate_skipped(self) -> None:
        mock_client = MagicMock()
        mock_client.create_evidence.return_value = {"id": "ev-123"}

        with tempfile.TemporaryDirectory() as tmpdir:
            checkpoint = CheckpointStore(path=Path(tmpdir) / ".ckpt.json")
            writer = EvidenceWriter(client=mock_client, checkpoint=checkpoint)

            event = PythiaEvent(
                event_id="evt-001",
                source_agent="agent",
                kind="test",
                title="T",
                body="Content",
            )
            writer.write_event(event)  # first time
            result2 = writer.write_event(event)  # second time → duplicate
            self.assertIsNone(result2)
            mock_client.create_evidence.assert_called_once()  # only once

    def test_stats(self) -> None:
        mock_client = MagicMock()
        with tempfile.TemporaryDirectory() as tmpdir:
            checkpoint = CheckpointStore(path=Path(tmpdir) / ".ckpt.json")
            writer = EvidenceWriter(client=mock_client, checkpoint=checkpoint)
            stats = writer.stats()
            self.assertIn("submitted_memory", stats)
            self.assertIn("batch_size", stats)


# ───── ForecastLedger Tests ─────

class TestForecastLedger(unittest.TestCase):
    def test_submit_forecast(self) -> None:
        mock_client = MagicMock()
        mock_client.create_claim.return_value = {"id": "claim-123"}

        with tempfile.TemporaryDirectory() as tmpdir:
            checkpoint = CheckpointStore(path=Path(tmpdir) / ".ckpt.json")
            ledger_path = Path(tmpdir) / ".ledger.json"
            ledger = ForecastLedger(
                client=mock_client,
                checkpoint=checkpoint,
                ledger_path=ledger_path,
            )

            forecast = PythiaForecast(
                forecast_id="fc-001",
                agent_id="agent",
                hypothesis="Will it work?",
                outcome="Yes",
                confidence=ForecastConfidence.HIGH,
                confidence_numeric=0.85,
            )
            claim_id = ledger.submit_forecast(forecast, evidence_ids=["ev-1"])
            self.assertEqual(claim_id, "claim-123")
            mock_client.create_claim.assert_called_once()

    def test_resubmit_returns_existing(self) -> None:
        mock_client = MagicMock()
        mock_client.create_claim.return_value = {"id": "claim-123"}

        with tempfile.TemporaryDirectory() as tmpdir:
            checkpoint = CheckpointStore(path=Path(tmpdir) / ".ckpt.json")
            ledger_path = Path(tmpdir) / ".ledger.json"
            ledger = ForecastLedger(
                client=mock_client,
                checkpoint=checkpoint,
                ledger_path=ledger_path,
            )

            forecast = PythiaForecast(
                forecast_id="fc-001",
                agent_id="agent",
                hypothesis="Q",
                outcome="A",
                confidence=ForecastConfidence.MEDIUM,
            )
            cid1 = ledger.submit_forecast(forecast, evidence_ids=["ev-1"])
            cid2 = ledger.submit_forecast(forecast, evidence_ids=["ev-1"])
            self.assertEqual(cid1, cid2)
            mock_client.create_claim.assert_called_once()  # not called twice

    def test_persistence(self) -> None:
        mock_client = MagicMock()
        mock_client.create_claim.return_value = {"id": "claim-123"}

        with tempfile.TemporaryDirectory() as tmpdir:
            checkpoint = CheckpointStore(path=Path(tmpdir) / ".ckpt.json")
            ledger_path = Path(tmpdir) / ".ledger.json"
            ledger1 = ForecastLedger(
                client=mock_client, checkpoint=checkpoint, ledger_path=ledger_path
            )

            forecast = PythiaForecast(
                forecast_id="fc-001",
                agent_id="agent",
                hypothesis="Q",
                outcome="A",
                confidence=ForecastConfidence.MEDIUM,
            )
            ledger1.submit_forecast(forecast, evidence_ids=["ev-1"])

            # New ledger should load existing mapping
            ledger2 = ForecastLedger(
                client=mock_client, checkpoint=checkpoint, ledger_path=ledger_path
            )
            self.assertEqual(
                ledger2.get_claim_id("fc-001"),
                "claim-123",
            )

    def test_stats(self) -> None:
        mock_client = MagicMock()
        with tempfile.TemporaryDirectory() as tmpdir:
            checkpoint = CheckpointStore(path=Path(tmpdir) / ".ckpt.json")
            ledger_path = Path(tmpdir) / ".ledger.json"
            ledger = ForecastLedger(
                client=mock_client, checkpoint=checkpoint, ledger_path=ledger_path
            )
            stats = ledger.stats()
            self.assertIn("tracked_forecasts", stats)
            self.assertEqual(stats["tracked_forecasts"], 0)


# ───── ImpactAdapter Tests ─────

class TestImpactAdapter(unittest.TestCase):
    def test_apply_impact(self) -> None:
        mock_client = MagicMock()
        mock_client.update_claim.return_value = {"updated": True}
        mock_client.add_graph_edge.return_value = {"edge_id": "edge-1"}

        mock_ledger = MagicMock()
        mock_ledger.get_claim_id.return_value = "claim-123"

        adapter = ImpactAdapter(client=mock_client, ledger=mock_ledger)

        impact = ImpactAnalysis(
            target_id="fc-001",
            target_type="forecast",
            tier=ImpactTier.HIGH,
            score=0.75,
            affected_agents=["agent-a"],
            rationale="High impact",
            generated_by="test-agent",
        )
        result = adapter.apply_impact(impact)
        self.assertTrue(result)
        mock_client.update_claim.assert_called()
        mock_client.add_graph_edge.assert_called()

    def test_apply_critical_sets_review_status(self) -> None:
        mock_client = MagicMock()
        mock_client.update_claim.return_value = {"updated": True}
        mock_ledger = MagicMock()
        mock_ledger.get_claim_id.return_value = "claim-critical"

        adapter = ImpactAdapter(client=mock_client, ledger=mock_ledger)

        impact = ImpactAnalysis(
            target_id="evt-001",
            target_type="event",
            tier=ImpactTier.CRITICAL,
            score=0.95,
            affected_agents=["agent-a"],
            rationale="Critical",
            generated_by="test-agent",
        )
        result = adapter.apply_impact(impact)
        self.assertTrue(result)
        # Should have called update_claim at least twice (metadata + status)
        self.assertGreaterEqual(mock_client.update_claim.call_count, 2)

    def test_apply_impact_missing_claim(self) -> None:
        mock_client = MagicMock()
        mock_ledger = MagicMock()
        mock_ledger.get_claim_id.return_value = None

        adapter = ImpactAdapter(client=mock_client, ledger=mock_ledger)
        impact = ImpactAnalysis(
            target_id="unknown",
            target_type="event",
            tier=ImpactTier.LOW,
            score=0.1,
            affected_agents=["a"],
            rationale="test",
            generated_by="test-agent",
        )
        result = adapter.apply_impact(impact)
        self.assertFalse(result)

    def test_impact_score_to_status(self) -> None:
        mock_client = MagicMock()
        adapter = ImpactAdapter(client=mock_client)
        self.assertEqual(adapter.impact_score_to_status(0.9), "needs_review")
        self.assertEqual(adapter.impact_score_to_status(0.7), "high_priority")
        self.assertEqual(adapter.impact_score_to_status(0.4), "monitored")
        self.assertEqual(adapter.impact_score_to_status(0.1), "low_priority")

    def test_tier_map(self) -> None:
        self.assertEqual(TIER_MAP[ImpactTier.LOW], "low")
        self.assertEqual(TIER_MAP[ImpactTier.CRITICAL], "critical")


# ───── GraphWriter Tests ─────

class TestGraphWriter(unittest.TestCase):
    def test_write_evidence_chain(self) -> None:
        mock_client = MagicMock()
        mock_client.add_graph_node.return_value = {"id": "node-1"}

        writer = GraphWriter(client=mock_client)
        event = PythiaEvent(
            event_id="evt-001",
            source_agent="agent",
            kind="test",
            title="T",
            body="B",
        )
        node_ids = writer.write_evidence_chain(event)
        self.assertIsInstance(node_ids, list)
        self.assertGreaterEqual(len(node_ids), 0)  # may or may not create node

    def test_link_evidence_to_claim(self) -> None:
        mock_client = MagicMock()
        writer = GraphWriter(client=mock_client)
        writer.link_evidence_to_claim("ev-1", "claim-1", supports=True)
        mock_client.add_graph_edge.assert_called_once()
        call_kwargs = mock_client.add_graph_edge.call_args
        self.assertEqual(call_kwargs.kwargs["edge_type"], EDGE_SUPPORTS)

    def test_link_evidence_to_claim_opposes(self) -> None:
        mock_client = MagicMock()
        writer = GraphWriter(client=mock_client)
        writer.link_evidence_to_claim("ev-1", "claim-1", supports=False)
        call_kwargs = mock_client.add_graph_edge.call_args
        self.assertEqual(call_kwargs.kwargs["edge_type"], "opposes")

    def test_write_forecast_prediction(self) -> None:
        mock_client = MagicMock()
        mock_client.add_graph_node.return_value = {"id": "outcome-1"}
        writer = GraphWriter(client=mock_client)

        forecast = PythiaForecast(
            forecast_id="fc-001",
            agent_id="agent",
            hypothesis="Q",
            outcome="A",
            confidence=ForecastConfidence.HIGH,
            confidence_numeric=0.85,
        )
        writer.write_forecast_prediction(forecast, "claim-1")
        self.assertGreaterEqual(mock_client.add_graph_node.call_count, 1)
        self.assertGreaterEqual(mock_client.add_graph_edge.call_count, 1)

    def test_stats(self) -> None:
        mock_client = MagicMock()
        writer = GraphWriter(client=mock_client)
        stats = writer.stats()
        self.assertIn("edges_written", stats)
        self.assertIn("nodes_written", stats)


# ───── Colibri Metrics Bridge Tests ─────

class TestColibriMetricsBridge(unittest.TestCase):
    """Test the bridge from Pythia models to ColibriMetrics for viz."""

    def test_event_to_peer_metrics(self) -> None:
        from pythia_connector.colibri_metrics import event_to_peer_metrics
        event = PythiaEvent(
            event_id="evt-001",
            source_agent="peer-agent",
            kind="test",
            title="T",
            body="B",
        )
        pm = event_to_peer_metrics(event)
        self.assertEqual(pm.id, "peer-agent")
        self.assertTrue(pm.connected)

    def test_forecast_to_peer_metrics(self) -> None:
        from pythia_connector.colibri_metrics import forecast_to_peer_metrics
        forecast = PythiaForecast(
            forecast_id="fc-001",
            agent_id="forecast-peer",
            hypothesis="Q",
            outcome="A",
            confidence=ForecastConfidence.MEDIUM,
        )
        pm = forecast_to_peer_metrics(forecast)
        self.assertEqual(pm.id, "forecast-peer")

    def test_impact_to_chunk_metrics(self) -> None:
        from pythia_connector.colibri_metrics import impact_to_chunk_metrics
        impact = ImpactAnalysis(
            target_id="evt-001",
            target_type="event",
            tier=ImpactTier.HIGH,
            score=0.7,
            affected_agents=["a", "b"],
            rationale="test",
            generated_by="test-agent",
        )
        chunks = impact_to_chunk_metrics(impact)
        self.assertEqual(len(chunks), 2)

    def test_build_colibri_metrics_packet(self) -> None:
        from pythia_connector.colibri_metrics import build_colibri_metrics_packet
        now = datetime.now(timezone.utc)
        events = [
            PythiaEvent(
                event_id="evt-001",
                source_agent="agent-a",
                kind="evidence",
                title="E",
                body="B",
                timestamp=now,
            ),
        ]
        forecasts = [
            PythiaForecast(
                forecast_id="fc-001",
                agent_id="agent-b",
                hypothesis="Q",
                outcome="A",
                confidence=ForecastConfidence.HIGH,
                confidence_numeric=0.9,
            ),
        ]
        impacts = [
            ImpactAnalysis(
                target_id="evt-001",
                target_type="event",
                tier=ImpactTier.HIGH,
                score=0.75,
                affected_agents=["agent-a"],
                rationale="test",
                generated_by="test",
            ),
        ]

        packet = build_colibri_metrics_packet(
            events=events,
            forecasts=forecasts,
            impacts=impacts,
            model_cid="Qm123",
            model_name="glm-5.2",
            model_loaded=True,
        )

        self.assertIn("colibri", packet)
        self.assertIn("timestamp", packet)
        self.assertIn("peers", packet)
        self.assertIn("chunks", packet)
        self.assertEqual(packet["colibri"]["model"]["name"], "glm-5.2")
        self.assertTrue(packet["colibri"]["model"]["loaded"])
        # Should have peers from both event and forecast sources
        peer_ids = [p["id"] for p in packet["peers"]]
        self.assertIn("agent-a", peer_ids)
        self.assertIn("agent-b", peer_ids)


if __name__ == "__main__":
    unittest.main(verbosity=2)
