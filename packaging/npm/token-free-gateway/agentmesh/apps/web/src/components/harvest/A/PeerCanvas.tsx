import React, { useState } from "react";

// peerd-inspired: PeerCanvas + WebRTC Dot + Sandbox Toolbar + Browser Agent Panel
export type Peer = {
  id: string;
  name: string;
  region?: string;
  protocol: "webrtc" | "websocket" | "memory" | "libp2p";
  status: "connected" | "connecting" | "offline";
  latencyMs?: number;
  capabilities: string[];
};

function WebRTCDot({ status }: { status: Peer["status"] }) {
  const cls = status === "connected" ? "webrtc-dot connected" : status === "connecting" ? "webrtc-dot connecting" : "webrtc-dot offline";
  return <span className={cls} title={status} aria-label={status} />;
}

function ProtocolBadge({ protocol }: { protocol: Peer["protocol"] }) {
  const label: Record<Peer["protocol"], string> = { webrtc: "WebRTC", websocket: "WS", memory: "Memory", libp2p: "libp2p" };
  return <span className={`protocol-badge proto-${protocol}`}>{label[protocol]}</span>;
}

export function PeerCanvas({ peers, onSelect, selectedId }: {
  peers: Peer[];
  onSelect?: ((id: string) => void) | undefined;
  selectedId?: string | undefined;
}) {
  const [filter, setFilter] = useState<"all" | Peer["status"]>("all");
  const filtered = filter === "all" ? peers : peers.filter(p => p.status === filter);
  const counts = {
    all: peers.length,
    connected: peers.filter(p => p.status === "connected").length,
    connecting: peers.filter(p => p.status === "connecting").length,
    offline: peers.filter(p => p.status === "offline").length,
  };
  return (
    <div className="peer-canvas">
      <div className="peer-canvas-toolbar">
        <div className="peer-filter-row">
          {(["all", "connected", "connecting", "offline"] as const).map(f => (
            <button key={f} className={`policy-chip ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
              {f === "all" ? `All ${counts.all}` : `${f} ${counts[f as Peer["status"]]}`}
            </button>
          ))}
        </div>
        <span className="peer-canvas-hint">WebRTC · Sandbox 격리 · Browser Agent</span>
      </div>

      <div className="peer-grid">
        {filtered.map(p => (
          <article key={p.id} className={`peer-card ${selectedId === p.id ? "selected" : ""}`} onClick={() => onSelect?.(p.id)}>
            <div className="peer-card-head">
              <WebRTCDot status={p.status} />
              <strong className="peer-name">{p.name}</strong>
              <ProtocolBadge protocol={p.protocol} />
            </div>
            <div className="peer-card-meta">
              <span className="peer-id">{p.id.slice(0, 12)}…</span>
              {p.region && <span className="peer-region">{p.region}</span>}
              {p.latencyMs != null && <span className="peer-latency">{p.latencyMs}ms</span>}
            </div>
            <div className="peer-caps">
              {p.capabilities.slice(0, 4).map(c => <span key={c} className="cap-chip sm">{c}</span>)}
              {p.capabilities.length > 4 && <span className="cap-more">+{p.capabilities.length - 4}</span>}
            </div>
            <div className="peer-card-foot">
              <span className={`peer-status ${p.status}`}>{p.status}</span>
              <span className="peer-connect-hint">{p.status === "connected" ? "● live" : p.status === "connecting" ? "◐ handshake" : "○ idle"}</span>
            </div>
          </article>
        ))}
        {filtered.length === 0 && <p className="dash-note">필터 결과 없음</p>}
      </div>
    </div>
  );
}

export function SandboxToolbar({ onAction }: { onAction?: (action: string) => void }) {
  return (
    <div className="sandbox-toolbar">
      <span className="sandbox-label">Sandbox</span>
      <button className="btn-secondary sm" onClick={() => onAction?.("isolate")}>Isolate</button>
      <button className="btn-secondary sm" onClick={() => onAction?.("inspect")}>Inspect</button>
      <button className="btn-secondary sm" onClick={() => onAction?.("restart")}>Restart</button>
      <span className="sandbox-hint">peerd · 격리 실행</span>
    </div>
  );
}

export function BrowserAgentPanel({ peer, onClose }: { peer: Peer | null; onClose?: (() => void) | undefined }) {
  if (!peer) return <div className="browser-agent-panel empty"><p className="dash-note">피어를 선택하세요</p></div>;
  return (
    <div className="browser-agent-panel">
      <div className="browser-agent-head">
        <WebRTCDot status={peer.status} />
        <strong>{peer.name}</strong>
        <ProtocolBadge protocol={peer.protocol} />
        <button className="btn-secondary sm" onClick={onClose}>닫기</button>
      </div>
      <div className="browser-agent-body">
        <div className="kv"><span>ID</span><code>{peer.id}</code></div>
        <div className="kv"><span>상태</span><span className={`peer-status ${peer.status}`}>{peer.status}</span></div>
        {peer.latencyMs != null && <div className="kv"><span>지연</span><span>{peer.latencyMs}ms</span></div>}
        <div className="kv"><span>프로토콜</span><span>{peer.protocol}</span></div>
        <div className="cap-row">{peer.capabilities.map(c => <span key={c} className="cap-chip sm">{c}</span>)}</div>
      </div>
      <SandboxToolbar />
    </div>
  );
}
