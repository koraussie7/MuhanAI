import React, { useEffect, useState } from "react";
import { load } from "../../services/api";
import { Progress, SpecPage as Page, StatGrid } from "../../components/common/spec";

interface MockPeer {
  id: string;
  name: string;
  protocol: "memory" | "webrtc" | "libp2p";
  latencyMs: number;
  status: "connected" | "connecting" | "idle";
  capabilities: string[];
}

interface LoggedMessage {
  id: string;
  type: string;
  from: string;
  to: string;
  payloadText: string;
  status: "delivered" | "pending" | "failed" | "expired";
  timestamp: number;
  ttlLeft: number;
  deliveredTo: string[];
}

const INITIAL_PEERS: MockPeer[] = [
  { id: "peer-kr-01", name: "Seoul-Node-Alpha", protocol: "memory", latencyMs: 14, status: "connected", capabilities: ["answer", "compute", "local_knowledge"] },
  { id: "peer-jp-02", name: "Tokyo-Gpu-Cluster", protocol: "webrtc", latencyMs: 38, status: "connected", capabilities: ["compute", "verify"] },
  { id: "peer-us-03", name: "US-West-Router", protocol: "libp2p", latencyMs: 122, status: "connected", capabilities: ["answer", "teach"] },
  { id: "peer-eu-04", name: "Frankfurt-Validator", protocol: "webrtc", latencyMs: 240, status: "idle", capabilities: ["verify"] },
];

export function P2pNetworkPage() {
  const [localNodeId] = useState("node-local-" + Math.random().toString(36).slice(2, 7));
  const [peers] = useState<MockPeer[]>(INITIAL_PEERS);
  const [activeTab, setActiveTab] = useState<"router" | "peers" | "messages">("router");

  // Message Router State
  const [targetPeer, setTargetPeer] = useState<string>("broadcast");
  const [msgType, setMsgType] = useState<string>("agent.query");
  const [payload, setPayload] = useState<string>('{"query": "최적 라우팅 경로 탐색"}');
  const [messageQueue, setMessageQueue] = useState<LoggedMessage[]>([
    {
      id: "msg-9f4a12",
      type: "gossip.peer-discovery",
      from: "peer-kr-01",
      to: "broadcast",
      payloadText: "capability: ['answer','compute']",
      status: "delivered",
      timestamp: Date.now() - 15000,
      ttlLeft: 45,
      deliveredTo: ["Seoul-Node-Alpha", "Tokyo-Gpu-Cluster", "US-West-Router"]
    }
  ]);

  // TTL Countdown Loop (60s Default TTL 반영)
  useEffect(() => {
    const timer = setInterval(() => {
      setMessageQueue((prev) =>
        prev.map((msg) => {
          if (msg.status === "delivered" || msg.status === "failed") return msg;
          const nextTtl = Math.max(0, msg.ttlLeft - 1);
          return {
            ...msg,
            ttlLeft: nextTtl,
            status: nextTtl === 0 ? "expired" : msg.status,
          };
        })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const newId = "msg-" + Math.random().toString(36).slice(2, 8);
    const isBroadcast = targetPeer === "broadcast";
    const targetPeers = isBroadcast
      ? peers.filter((p) => p.status === "connected")
      : peers.filter((p) => p.id === targetPeer);

    const isConnected = targetPeers.some((p) => p.status === "connected");
    const status: LoggedMessage["status"] = isConnected ? "delivered" : "pending";

    const newMessage: LoggedMessage = {
      id: newId,
      type: msgType,
      from: localNodeId,
      to: isBroadcast ? "ALL (Broadcast)" : (targetPeers[0]?.name || targetPeer),
      payloadText: payload,
      status,
      timestamp: Date.now(),
      ttlLeft: 60,
      deliveredTo: targetPeers.map((p) => p.name),
    };

    setMessageQueue((prev) => [newMessage, ...prev]);
  };

  const deliveredCount = messageQueue.filter((m) => m.status === "delivered").length;
  const pendingCount = messageQueue.filter((m) => m.status === "pending").length;

  return (
    <Page
      title="P2P Mesh Network & Message Router"
      subtitle="탈중앙화 Capability-Sharing Mesh — 분산 메시지 라우터 & 피어 노드 제어"
    >
      <div className="p2p-node-banner">
        <div className="node-id-chip">
          <span className="pulse-dot on" />
          <span>Local Node: <strong>{localNodeId}</strong></span>
          <span className="protocol-badge">Transport: Memory / WebRTC</span>
        </div>
        <div className="router-quick-stats">
          <span>Delivered: <strong className="text-accent">{deliveredCount}</strong></span>
          <span>Pending: <strong className="text-warning">{pendingCount}</strong></span>
          <span>Connected Peers: <strong>{peers.filter((p) => p.status === "connected").length}/{peers.length}</strong></span>
          <span>Default TTL: <strong>60s</strong></span>
        </div>
      </div>

      <div className="policy-row" style={{ marginTop: "16px", marginBottom: "16px" }}>
        <button
          type="button"
          className={`policy-chip ${activeTab === "router" ? "active" : ""}`}
          onClick={() => setActiveTab("router")}
        >
          ⚡ 메시지 라우터 콘솔
        </button>
        <button
          type="button"
          className={`policy-chip ${activeTab === "peers" ? "active" : ""}`}
          onClick={() => setActiveTab("peers")}
        >
          🕸️ 활성 피어 ({peers.length})
        </button>
        <button
          type="button"
          className={`policy-chip ${activeTab === "messages" ? "active" : ""}`}
          onClick={() => setActiveTab("messages")}
        >
          📜 라우터 패킷 로그 ({messageQueue.length})
        </button>
      </div>

      {activeTab === "router" && (
        <div className="p2p-router-layout">
          <div className="dash-block router-send-card">
            <h3>📨 메시지 발송 & 브로드캐스트</h3>
            <form onSubmit={handleSendMessage} className="router-form">
              <div className="form-group">
                <label>수신 대상 (Target Peer)</label>
                <select value={targetPeer} onChange={(e) => setTargetPeer(e.target.value)}>
                  <option value="broadcast">📢 전체 브로드캐스트 (Broadcast to All)</option>
                  {peers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.latencyMs}ms - {p.status})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>메시지 타입 (Protocol Topic)</label>
                <select value={msgType} onChange={(e) => setMsgType(e.target.value)}>
                  <option value="agent.query">agent.query (에이전트 질의 요청)</option>
                  <option value="verify.claim">verify.claim (지식 검증 요청)</option>
                  <option value="compute.task">compute.task (연산 분산 요청)</option>
                  <option value="ping.echo">ping.echo (연결 확인 및 지연 측정)</option>
                </select>
              </div>

              <div className="form-group">
                <label>페이로드 (JSON / Raw Payload)</label>
                <textarea
                  rows={3}
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  className="router-textarea"
                />
              </div>

              <button type="submit" className="primary-button" style={{ width: "100%", justifyContent: "center" }}>
                패킷 라우팅 실행 <span>→</span>
              </button>
            </form>
          </div>

          <div className="dash-block router-queue-card">
            <h3>🔄 최근 패킷 큐 상태 (TTL 모니터링)</h3>
            <div className="packet-list">
              {messageQueue.slice(0, 5).map((msg) => (
                <div className="packet-item" key={msg.id}>
                  <div className="packet-header">
                    <span className="packet-id">{msg.id}</span>
                    <span className={`status-pill ${msg.status}`}>{msg.status}</span>
                    <span className="packet-ttl">TTL: {msg.ttlLeft}s</span>
                  </div>
                  <div className="packet-route">
                    <span>{msg.from}</span> → <strong>{msg.to}</strong>
                  </div>
                  <div className="packet-meta">
                    <code>{msg.type}</code>
                    {msg.deliveredTo.length > 0 && (
                      <span className="delivered-nodes">도달: {msg.deliveredTo.join(", ")}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "peers" && (
        <div className="spec-grid">
          {peers.map((peer) => (
            <div className="spec-card" key={peer.id}>
              <div className="spec-card-head">
                <span className={`status-dot ${peer.status}`} />
                <span className="spec-kind">{peer.protocol}</span>
                <span className="latency-badge">{peer.latencyMs}ms</span>
              </div>
              <h3 style={{ margin: "10px 0 4px" }}>{peer.name}</h3>
              <p style={{ fontSize: "12px", color: "var(--muted)", margin: "0 0 12px" }}>ID: {peer.id}</p>

              <div className="spec-tags">
                {peer.capabilities.map((c) => (
                  <span className="spec-tag" key={c}>✓ {c}</span>
                ))}
              </div>

              <div style={{ marginTop: "14px", display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setTargetPeer(peer.id);
                    setActiveTab("router");
                  }}
                  style={{ fontSize: "12px", padding: "6px 10px" }}
                >
                  Direct Send
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "messages" && (
        <div className="spec-list">
          {messageQueue.map((msg) => (
            <div className="spec-row" key={msg.id}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
                  <strong>{msg.id}</strong>
                  <span className={`status-pill ${msg.status}`}>{msg.status}</span>
                  <span style={{ fontSize: "12px", color: "var(--muted)" }}>TTL {msg.ttlLeft}s 남음</span>
                </div>
                <div style={{ fontSize: "13px", color: "var(--muted)" }}>
                  <span>From: {msg.from}</span> | <span>To: {msg.to}</span>
                </div>
                <div style={{ fontSize: "12px", marginTop: "4px", background: "#11110f", padding: "6px 8px", borderRadius: "4px" }}>
                  <code>{msg.payloadText}</code>
                </div>
              </div>
              <div className="spec-row-meta" style={{ textAlign: "right" }}>
                <span style={{ color: "var(--accent)" }}>{msg.type}</span>
                <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}

// ---- Compute Mesh ----
