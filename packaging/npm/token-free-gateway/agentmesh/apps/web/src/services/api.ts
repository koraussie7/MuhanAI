// Single API base for the web app. Same-origin by default; override with
// VITE_API_BASE (e.g. the feed API origin in production).
import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_BASE ?? "";

/** JSON fetch helper: resolves null on any failure (feeds tolerate absence). */
export function load<T>(path: string): Promise<T | null> {
  return fetch(`${API}${path}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}

/** JSON POST helper: resolves null on any failure. */
export function apiPost<T>(path: string, body: unknown): Promise<T | null> {
  return fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}

/** Network event types received from the /api/events SSE stream. */
export interface NetworkStatsEvent {
  type: "connected" | "network.stats";
  data?: {
    agentsOnline: number;
    totalAgents: number;
    byType: Record<string, number>;
    avgLatencyMs: number;
  };
  timestamp: number;
}

/**
 * Subscribe to live Network Events via Server-Sent Events.
 * Returns the latest stats snapshot and connection state.
 */
export function useNetworkEvents() {
  const [stats, setStats] = useState<NetworkStatsEvent["data"] | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const base = API || window.location.origin;
    const source = new EventSource(`${base}/api/events`);

    source.onmessage = (e) => {
      const evt: NetworkStatsEvent = JSON.parse(e.data);
      if (evt.type === "connected") {
        setConnected(true);
      } else if (evt.type === "network.stats" && evt.data) {
        setStats(evt.data);
      }
    };

    source.onerror = () => {
      setConnected(false);
    };

    return () => source.close();
  }, []);

  return { stats, connected };
}
