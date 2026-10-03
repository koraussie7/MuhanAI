"""Export bridge: Pythia/PythiaForecast → ColibriMetrics TypeScript interfaces.

This module provides Python equivalents of the TypeScript interfaces in:
  packages/knowledge-base/src/visuals/colibri-metrics.ts

It enables the Pythia Connector to emit metrics packets that are
consumable by the Colibri WASM viz layer (W5 visualization dashboard).

Key bridges:
  ColibriMetrics      → colibri_metrics_to_dict()
  PeerMetrics         → peer_metrics_to_dict()
  ModelChunkMetrics   → chunk_metrics_to_dict()

These are designed to be forwarded over the P2P stream via
packages/knowledge-base/src/p2p-memory/p2p-stream.ts

Schema contract reference: docs/thin-client/AGENT-WORK-SPLIT.md §6
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from .models import PythiaEvent, PythiaForecast, ImpactAnalysis

logger = logging.getLogger("pythia_connector.colibri_metrics")


@dataclass
class ColibriMemoryMetrics:
    """Memory usage metrics — mirrors ColibriMetrics['memory']."""

    used: float  # MB
    total: float  # MB
    wasm_heap: float  # MB
    js_heap: float  # MB


@dataclass
class ColibriInferenceMetrics:
    """Inference performance metrics — mirrors ColibriMetrics['inference']."""

    tokens_per_second: float
    latency_ms: float
    batch_size: int


@dataclass
class ColibriP2PMetrics:
    """P2P network metrics — mirrors ColibriMetrics['p2p']."""

    peers: int
    download_mbps: float
    upload_mbps: float
    chunks_cached: int
    cache_hit_rate: float


@dataclass
class ColibriModelInfo:
    """Model info — mirrors ColibriMetrics['model']."""

    cid: str
    name: str
    loaded: bool
    quantization: str
    file_size: int  # bytes


@dataclass
class ColibriMetrics:
    """Complete Colibri metrics packet.

    Mirrors the TypeScript ColibriMetrics interface from
    packages/knowledge-base/src/visuals/colibri-metrics.ts
    """

    memory: ColibriMemoryMetrics
    inference: ColibriInferenceMetrics
    p2p: ColibriP2PMetrics
    model: ColibriModelInfo


@dataclass
class PeerMetrics:
    """Per-peer metrics — mirrors PeerMetrics TS interface."""

    id: str
    region: str
    type: Literal["browser", "fellowship", "gateway"]
    connected: bool
    download_mbps: float
    upload_mbps: float
    shared_chunks: int
    last_seen: float  # epoch


@dataclass
class ModelChunkMetrics:
    """Per-chunk metrics — mirrors ModelChunkMetrics TS interface."""

    cid: str
    index: int
    size: int
    status: Literal["cached", "downloading", "pending", "error"]
    peer_count: int
    download_speed: float
    estimated_time: float


def event_to_peer_metrics(event: PythiaEvent) -> PeerMetrics:
    """Convert a PythiaEvent to a PeerMetrics entry for viz reporting.

    The source_agent of the event is treated as the peer ID.
    """
    now = time.time()
    return PeerMetrics(
        id=event.source_agent,
        region="global",
        type="gateway",  # events come from gateway agents by default
        connected=True,
        download_mbps=0.0,
        upload_mbps=0.0,
        shared_chunks=0,
        last_seen=now,
    )


def forecast_to_peer_metrics(forecast: PythiaForecast) -> PeerMetrics:
    """Convert a PythiaForecast to a PeerMetrics entry."""
    now = time.time()
    return PeerMetrics(
        id=forecast.agent_id,
        region="global",
        type="gateway",
        connected=True,
        download_mbps=0.0,
        upload_mbps=0.0,
        shared_chunks=0,
        last_seen=now,
    )


def impact_to_chunk_metrics(impact: ImpactAnalysis) -> list[ModelChunkMetrics]:
    """Convert an ImpactAnalysis to a list of ModelChunkMetrics.

    Each affected agent is represented as a chunk with status derived
    from the impact tier.
    """
    tier_to_status: dict[str, str] = {
        "low": "pending",
        "medium": "downloading",
        "high": "cached",
        "critical": "cached",
    }

    chunks: list[ModelChunkMetrics] = []
    for i, agent in enumerate(impact.affected_agents):
        chunks.append(
            ModelChunkMetrics(
                cid=impact.target_id,
                index=i,
                size=int(1024 * 1024 * 10),  # ~10MB per agent chunk estimate
                status=tier_to_status.get(impact.tier.value, "pending"),
                peer_count=max(1, len(impact.affected_agents)),
                download_speed=0.0,
                estimated_time=0.0 if impact.tier in ("high", "critical") else 5.0,
            )
        )
    return chunks


def colibri_metrics_to_dict(metrics: ColibriMetrics) -> dict[str, Any]:
    """Serialize ColibriMetrics to a dict suitable for JSON over P2P."""
    return {
        "memory": asdict(metrics.memory),
        "inference": asdict(metrics.inference),
        "p2p": asdict(metrics.p2p),
        "model": asdict(metrics.model),
    }


def peer_metrics_to_dict(pm: PeerMetrics) -> dict[str, Any]:
    """Serialize PeerMetrics to dict with camelCase keys for TS compatibility."""
    return {
        "id": pm.id,
        "region": pm.region,
        "type": pm.type,
        "connected": pm.connected,
        "downloadMbps": pm.download_mbps,
        "uploadMbps": pm.upload_mbps,
        "sharedChunks": pm.shared_chunks,
        "lastSeen": pm.last_seen,
    }


def chunk_metrics_to_dict(cm: ModelChunkMetrics) -> dict[str, Any]:
    """Serialize ModelChunkMetrics to dict with camelCase keys for TS compatibility."""
    return {
        "cid": cm.cid,
        "index": cm.index,
        "size": cm.size,
        "status": cm.status,
        "peerCount": cm.peer_count,
        "downloadSpeed": cm.download_speed,
        "estimatedTime": cm.estimated_time,
    }


def build_colibri_metrics_packet(
    events: list[PythiaEvent],
    forecasts: list[PythiaForecast],
    impacts: list[ImpactAnalysis],
    memory_used_mb: Optional[float] = None,
    memory_total_mb: float = 256.0,
    wasm_heap_mb: Optional[float] = None,
    js_heap_mb: Optional[float] = None,
    tokens_per_second: float = 12.5,
    latency_ms: float = 42.0,
    peers: int = 0,
    download_mbps: float = 0.0,
    upload_mbps: float = 0.0,
    chunks_cached: int = 0,
    cache_hit_rate: float = 0.0,
    model_cid: str = "",
    model_name: str = "unknown",
    model_loaded: bool = False,
    model_quantization: str = "fp16",
    model_file_size: int = 0,
) -> dict[str, Any]:
    """Build a complete ColibriMetrics packet for dashboard ingestion.

    This is the primary entry point for emitting viz data from the
    Pythia Connector to the Colibri WASM dashboard.

    Returns a dict matching the TypeScript ColibriMetrics interface,
    ready for p2p-stream.ts → browser-bridge.ts → ColibriMetricsChart.
    """
    import os

    mem_used = memory_used_mb if memory_used_mb is not None else (
        float(os.environ.get("COLIBRI_MEMORY_USED", "128"))
    )
    wasm_heap = wasm_heap_mb if wasm_heap_mb is not None else (
        float(os.environ.get("COLIBRI_WASM_HEAP", "64"))
    )
    js_heap = js_heap_mb if js_heap_mb is not None else (
        float(os.environ.get("COLIBRI_JS_HEAP", "32"))
    )

    metrics = ColibriMetrics(
        memory=ColibriMemoryMetrics(
            used=mem_used,
            total=memory_total_mb,
            wasm_heap=wasm_heap,
            js_heap=js_heap,
        ),
        inference=ColibriInferenceMetrics(
            tokens_per_second=tokens_per_second,
            latency_ms=latency_ms,
            batch_size=len(events) + len(forecasts),
        ),
        p2p=ColibriP2PMetrics(
            peers=peers,
            download_mbps=download_mbps,
            upload_mbps=upload_mbps,
            chunks_cached=chunks_cached,
            cache_hit_rate=cache_hit_rate,
        ),
        model=ColibriModelInfo(
            cid=model_cid,
            name=model_name,
            loaded=model_loaded,
            quantization=model_quantization,
            file_size=model_file_size,
        ),
    )

    peer_metrics: list[dict[str, Any]] = []
    chunk_metrics: list[dict[str, Any]] = []

    # Event sources → peers
    seen_peers: set[str] = set()
    for event in events:
        if event.source_agent not in seen_peers:
            seen_peers.add(event.source_agent)
            peer_metrics.append(peer_metrics_to_dict(event_to_peer_metrics(event)))

    # Forecast sources → peers
    for forecast in forecasts:
        if forecast.agent_id not in seen_peers:
            seen_peers.add(forecast.agent_id)
            peer_metrics.append(peer_metrics_to_dict(forecast_to_peer_metrics(forecast)))

    # Impact → chunk distribution
    for impact in impacts:
        chunk_metrics.extend(
            chunk_metrics_to_dict(c) for c in impact_to_chunk_metrics(impact)
        )

    packet = {
        "colibri": colibri_metrics_to_dict(metrics),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        # TS interface uses camelCase for P2P fields
        "peers": peer_metrics,
        "chunks": chunk_metrics,
        # Schema version for forward-compat
        "version": "1.0.0",
    }

    logger.debug(
        "Built ColibriMetrics packet: %d peers, %d chunks, model=%s",
        len(peer_metrics),
        len(chunk_metrics),
        model_name,
    )

    return packet
