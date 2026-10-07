"""LocalCrab Adapter — bridges Pythia events to LocalCrab evidence/claim/graph."""

__version__ = "1.0.0"

from localcrab_adapter.client import LocalCrabClient
from localcrab_adapter.mapper import map_event_to_evidence, map_forecast_to_claim
from localcrab_adapter.evidence_writer import EvidenceWriter
from localcrab_adapter.graph_writer import GraphWriter
from localcrab_adapter.forecast_ledger import ForecastLedger
from localcrab_adapter.impact import ImpactAnalyzer

__all__ = [
    "client",
    "mapper",
    "evidence_writer",
    "graph_writer",
    "forecast_ledger",
    "impact",
    "main",
    "LocalCrabClient",
    "EvidenceWriter",
    "GraphWriter",
    "ForecastLedger",
    "ImpactAnalyzer",
    "map_event_to_evidence",
    "map_forecast_to_claim",
]
