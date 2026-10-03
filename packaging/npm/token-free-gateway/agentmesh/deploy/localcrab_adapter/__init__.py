"""LocalCrab Adapter — bridges Pythia events to LocalCrab evidence/claim/graph.

Pythia events and forecasts from the P2PCLAW collective are mapped to
LocalCrab's evidence/claim/graph model:

  PythiaEvent      → LocalCrab Evidence (with content-hash CID)
  PythiaForecast   → LocalCrab Claim + Evidence linking
  ImpactAnalysis   → LocalCrab Claim metadata + edge annotations

Modules:
  - client:         LocalCrab HTTP API client
  - mapper:         Pythia model → LocalCrab claim/evidence field mapping
  - evidence_writer: Submit evidence to LocalCrab
  - graph_writer:   Write Pythia-derived edges to LocalCrab graph
  - forecast_ledger: Track and reconcile Pythia forecasts as claims
  - impact:         Map Pythia ImpactAnalysis → LocalCrab claim tiers
"""

__version__ = "1.0.0"
__all__ = [
    "client",
    "mapper",
    "evidence_writer",
    "graph_writer",
    "forecast_ledger",
    "impact",
]
