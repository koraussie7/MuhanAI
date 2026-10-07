"""Bridge between Python Colibri metrics and TypeScript ColibriMetrics types.

Provides serialization to/from the shared contract defined in
packages/knowledge-base/src/visuals/colibri-metrics.ts.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass
class ColibriMetrics:
    """Mirror of the TypeScript ColibriMetrics interface.

    Represents engine-level metrics for the Colibri inference engine.
    """

    model_name: str
    model_cid: str | None = None
    vocab_size: int = 0
    hidden_size: int = 0
    num_layers: int = 0
    num_heads: int = 0
    head_dim: int = 0
    max_seq_len: int = 0
    tokens_generated: int = 0
    tokens_per_second: float = 0.0
    memory_used_mb: float = 0.0
    memory_total_mb: float = 0.0
    load_time_ms: float = 0.0
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return {
            "modelName": self.model_name,
            "modelCid": self.model_cid,
            "vocabSize": self.vocab_size,
            "hiddenSize": self.hidden_size,
            "numLayers": self.num_layers,
            "numHeads": self.num_heads,
            "headDim": self.head_dim,
            "maxSeqLen": self.max_seq_len,
            "tokensGenerated": self.tokens_generated,
            "tokensPerSecond": self.tokens_per_second,
            "memoryUsedMB": self.memory_used_mb,
            "memoryTotalMB": self.memory_total_mb,
            "loadTimeMs": self.load_time_ms,
            "timestamp": self.timestamp,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ColibriMetrics":
        return cls(
            model_name=data.get("modelName", data.get("model_name", "")),
            model_cid=data.get("modelCid", data.get("model_cid")),
            vocab_size=data.get("vocabSize", data.get("vocab_size", 0)),
            hidden_size=data.get("hiddenSize", data.get("hidden_size", 0)),
            num_layers=data.get("numLayers", data.get("num_layers", 0)),
            num_heads=data.get("numHeads", data.get("num_heads", 0)),
            head_dim=data.get("headDim", data.get("head_dim", 0)),
            max_seq_len=data.get("maxSeqLen", data.get("max_seq_len", 0)),
            tokens_generated=data.get("tokensGenerated", data.get("tokens_generated", 0)),
            tokens_per_second=data.get("tokensPerSecond", data.get("tokens_per_second", 0.0)),
            memory_used_mb=data.get("memoryUsedMB", data.get("memory_used_mb", 0.0)),
            memory_total_mb=data.get("memoryTotalMB", data.get("memory_total_mb", 0.0)),
            load_time_ms=data.get("loadTimeMs", data.get("load_time_ms", 0.0)),
            timestamp=data.get("timestamp", datetime.now(timezone.utc).isoformat()),
        )


@dataclass
class PeerMetrics:
    """Mirror of the TypeScript PeerMetrics interface."""

    peer_id: str
    region: str = "global"
    status: str = "offline"
    model_name: str | None = None
    wasm_loaded: bool = False
    native_loaded: bool = False
    uptime_seconds: int = 0
    last_seen: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return {
            "peerId": self.peer_id,
            "region": self.region,
            "status": self.status,
            "modelName": self.model_name,
            "wasmLoaded": self.wasm_loaded,
            "nativeLoaded": self.native_loaded,
            "uptimeSeconds": self.uptime_seconds,
            "lastSeen": self.last_seen,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "PeerMetrics":
        return cls(
            peer_id=data.get("peerId", data.get("peer_id", "")),
            region=data.get("region", "global"),
            status=data.get("status", "offline"),
            model_name=data.get("modelName", data.get("model_name")),
            wasm_loaded=data.get("wasmLoaded", data.get("wasm_loaded", False)),
            native_loaded=data.get("nativeLoaded", data.get("native_loaded", False)),
            uptime_seconds=data.get("uptimeSeconds", data.get("uptime_seconds", 0)),
            last_seen=data.get("lastSeen", data.get("last_seen", datetime.now(timezone.utc).isoformat())),
        )


@dataclass
class ModelChunkMetrics:
    """Mirror of the TypeScript ModelChunkMetrics interface."""

    model_cid: str
    total_chunks: int
    chunks_served: int
    chunk_size_mb: float = 0.0
    total_size_mb: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "modelCid": self.model_cid,
            "totalChunks": self.total_chunks,
            "chunksServed": self.chunks_served,
            "chunkSizeMB": self.chunk_size_mb,
            "totalSizeMB": self.total_size_mb,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ModelChunkMetrics":
        return cls(
            model_cid=data.get("modelCid", data.get("model_cid", "")),
            total_chunks=data.get("totalChunks", data.get("total_chunks", 0)),
            chunks_served=data.get("chunksServed", data.get("chunks_served", 0)),
            chunk_size_mb=data.get("chunkSizeMB", data.get("chunk_size_mb", 0.0)),
            total_size_mb=data.get("totalSizeMB", data.get("total_size_mb", 0.0)),
        )
