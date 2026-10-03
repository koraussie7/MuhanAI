"""Pythia Connector — Pythia event collection bridge for MuhanAI agentmesh.

This package implements ingestion of Pythia AI research events and forecasts
into the P2PCLAW decentralized research network.

Modules:
  - models:    Shared Pydantic schemas (PythiaEvent, PythiaForecast, ImpactAnalysis).
  - client:    HTTP client for Pythia API.
  - normalizer: Raw Pythia payloads → canonical schema.
  - poller:    Scheduled incremental polling.
  - webhook:   Incoming Pythia webhook receiver.
  - dedupe:    Cross-agent deduplication via content hash.
  - checkpoint: Resume-after state management.
  - retry:     Exponential backoff retry wrapper.
  - colibri_metrics: Export bridge to Colibri WASM metrics / W5 visuals.
"""

__version__ = "1.0.0"
__all__ = [
    "models",
    "client",
    "normalizer",
    "poller",
    "webhook",
    "dedupe",
    "checkpoint",
    "retry",
    "colibri_metrics",
]

__docinfo__ = {
    "spec": "MuhanAI Phase 2 Integration Plan",
    "schema_contract": "docs/thin-client/AGENT-WORK-SPLIT.md §6",
    "visuals_bridge": "packages/knowledge-base/src/visuals/colibri-metrics.ts",
}
