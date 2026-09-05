import { useState, useEffect } from "react";

export function HiveBearPanel() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const res = await fetch("/api/hivebear/status");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "status failed");
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "status failed");
    }
  };

  const startMesh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hivebear/mesh/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ port: 7878 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "start failed");
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "start failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel">
      <div className="section-heading compact">
        <span className="section-label">HIVEBEAR MESH</span>
        <h2>Distributed Inference</h2>
      </div>

      <div className="cast-actions">
        <button type="button" onClick={startMesh} disabled={loading}>
          {loading ? "시작 중..." : "Start Mesh"}
        </button>
        <button type="button" onClick={loadStatus}>Refresh</button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {status && (
        <div className="cast-results">
          <div>
            Peer: <strong>{status.peerId}</strong> · Status: <strong>{status.status}</strong>
          </div>
          <div>
            Load: {Math.round((status.load ?? 0) * 100)}% · Latency: {status.latencyMs}ms
          </div>
          {status.capabilities?.models?.length > 0 && (
            <div>Models: {status.capabilities.models.join(", ")}</div>
          )}
        </div>
      )}
    </section>
  );
}
