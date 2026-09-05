import { useState, useEffect } from "react";

export interface PeerInfo {
  peerId: string;
  address: string;
  online: boolean;
  reputation: number;
  capabilities: string[];
}

export interface FederationStatus {
  peers: PeerInfo[];
  localRecords: number;
  syncedAt?: string;
}

export function FederationPanel() {
  const [status, setStatus] = useState<FederationStatus>({ peers: [], localRecords: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPeer, setNewPeer] = useState({ peerId: "", address: "" });

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const [peersRes, localRes] = await Promise.all([
        fetch("/api/knowledge/folklore/peers").then((r) => r.json()),
        fetch("/api/knowledge/folklore/query", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: "__count__", embedding: new Array(384).fill(0) }),
        }).then((r) => r.json()),
      ]);

      setStatus({
        peers: peersRes.peers ?? [],
        localRecords: localRes.count ?? 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
    }
  };

  const addPeer = async () => {
    if (!newPeer.peerId.trim() || !newPeer.address.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge/folklore/peers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ peerId: newPeer.peerId, address: newPeer.address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "add peer failed");
      setNewPeer({ peerId: "", address: "" });
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "add peer failed");
    } finally {
      setLoading(false);
    }
  };

  const sync = async () => {
    setLoading(true);
    setError(null);
    try {
      await fetch("/api/knowledge/folklore/sync", { method: "POST" });
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "sync failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel">
      <div className="section-heading compact">
        <span className="section-label">FOLKLORE FEDERATION</span>
        <h2>Decentralized Knowledge Mesh</h2>
      </div>

      <div className="cast-actions">
        <button type="button" onClick={sync} disabled={loading}>
          {loading ? "동기화 중..." : "Sync"}
        </button>
        <button type="button" onClick={loadStatus}>Refresh</button>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="cast-results">
        <div>
          Local records: <strong>{status.localRecords}</strong>
        </div>
        <div>
          Peers: <strong>{status.peers.length}</strong>
        </div>
      </div>

      {status.peers.length > 0 && (
        <div className="agent-list">
          {status.peers.map((peer) => (
            <div key={peer.peerId} className="agent-card">
              <div className="agent-header">
                <span className={`agent-type ${peer.online ? "online" : "offline"}`}>{peer.online ? "online" : "offline"}</span>
                <span>Rep: {Math.round(peer.reputation * 100)}%</span>
              </div>
              <div className="agent-name">{peer.peerId}</div>
              <div className="agent-capabilities">
                {(peer.capabilities ?? []).map((cap) => (
                  <span key={cap} className="cap-tag">{cap}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="cast-input" style={{ marginTop: 16 }}>
        <label>Add Peer</label>
        <input
          value={newPeer.peerId}
          onChange={(e) => setNewPeer((s) => ({ ...s, peerId: e.target.value }))}
          placeholder="Peer ID"
        />
        <input
          value={newPeer.address}
          onChange={(e) => setNewPeer((s) => ({ ...s, address: e.target.value }))}
          placeholder="Address"
        />
        <button type="button" onClick={addPeer} disabled={loading}>
          Add Peer
        </button>
      </div>
    </section>
  );
}
