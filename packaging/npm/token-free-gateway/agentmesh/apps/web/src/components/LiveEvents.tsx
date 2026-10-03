// apps/web/src/components/LiveEvents.tsx
// P2PCLAW Live Events — real-time Pythia event stream from the P2P network
import { useEffect, useRef, useState } from "react";
import type { PythiaEvent, EventSeverity } from "@knowledge-base/visuals/pythia-types";
import { LiveBlockStream } from "./visuals/LiveBlockStream";

const API = import.meta.env.VITE_API_BASE ?? "";

const SEVERITY_COLORS: Record<EventSeverity, string> = {
  info: "badge-ghost",
  warning: "badge-warning",
  critical: "badge-error",
  fatal: "badge-error",
};

const KIND_ICONS: Record<string, string> = {
  evidence: "🔍",
  prediction: "🔮",
  model_update: "🧠",
  alert: "⚠️",
  verification: "✅",
};

function getKindIcon(kind: string): string {
  return KIND_ICONS[kind] ?? "📝";
}

export function LiveEvents() {
  const [events, setEvents] = useState<PythiaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    let cancelled = false;
    let eventSource: EventSource | null = null;

    // Try SSE first for real-time streaming
    const url = `${API}/api/p2pclaw/events/stream`;
    eventSource = new EventSource(url);

    eventSource.addEventListener("pythia-event", (e: MessageEvent) => {
      if (cancelled) return;
      try {
        const event = JSON.parse(e.data) as PythiaEvent;
        setEvents((prev) => {
          const updated = [...prev.slice(-99), event]; // keep last 100
          return updated;
        });
      } catch {
        // Fallback: try fetching batch
      }
    });

    eventSource.onerror = () => {
      if (cancelled) return;
      // Fallback to polling if SSE fails
      const loadEvents = async () => {
        try {
          const resp = await fetch(`${API}/api/p2pclaw/events?limit=50`);
          if (resp.ok) {
            const data: PythiaEvent[] = await resp.json();
            setEvents(data);
            setLoading(false);
          }
        } catch {
          // Use demo data if API unavailable
          setEvents([
            {
              eventId: "evt-demo-1",
              sourceAgent: "claude-thin-client",
              kind: "evidence",
              severity: "info",
              title: "Model deployed to fellowship node",
              body: "GLM-5.2 WASM module loaded successfully",
              timestamp: new Date().toISOString(),
              metadata: {},
              schemaVersion: "1.0.0",
            },
            {
              eventId: "evt-demo-2",
              sourceAgent: "claude-thin-client",
              kind: "prediction",
              severity: "warning",
              title: "High latency detected on P2P chunk transfer",
              body: "Browser node download speed dropped to 2.1 Mbps",
              timestamp: new Date(Date.now() - 30000).toISOString(),
              metadata: {},
              schemaVersion: "1.0.0",
            },
          ]);
          setLoading(false);
        }
      };

      loadEvents();
      const interval = setInterval(loadEvents, 10000);

      return () => {
        cancelled = true;
        eventSource?.close();
        clearInterval(interval);
      };
    };

    return () => {
      cancelled = true;
      eventSource?.close();
    };
  }, [API]);

  useEffect(() => {
    if (events.length > 0 && !loading) {
      scrollToBottom();
    }
  }, [events, loading]);

  const filteredEvents = filter
    ? events.filter((e) => e.sourceAgent.toLowerCase().includes(filter.toLowerCase()) || e.kind.includes(filter.toLowerCase()))
    : events;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Live Events</h1>
        <div className="badge badge-primary">P2P Stream</div>
      </div>

      {/* Filter Bar */}
      <div className="flex gap-4 mb-4">
        <input
          type="text"
          placeholder="Filter by agent or kind..."
          className="input input-bordered"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select className="select select-bordered">
          <option value="">All Severities</option>
          <option value="info">Info Only</option>
          <option value="warning">Warnings+</option>
          <option value="critical">Critical Only</option>
        </select>
      </div>

      {/* Live Block Stream Visualization */}
      <div className="h-48 mb-6">
        <LiveBlockStream />
      </div>

      {/* Events List */}
      <div className="card bg-base-200 shadow-xl">
        <div className="card-body">
          <h3 className="card-title">
            Event Feed ({filteredEvents.length} events)
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {loading ? (
              <p className="dash-note">Loading events…</p>
            ) : filteredEvents.length === 0 ? (
              <p className="dash-note">No events matching filter.</p>
            ) : (
              filteredEvents.slice().reverse().map((event) => (
                <div key={event.eventId} className="border border-base-300 rounded-lg p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <span className="text-xl">{getKindIcon(event.kind)}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{event.title}</span>
                          <span className={`badge ${SEVERITY_COLORS[event.severity]} badge-sm`}>
                            {event.severity}
                          </span>
                          <span className="text-xs text-base-content/50">
                            [{event.kind}]
                          </span>
                        </div>
                        <p className="text-sm text-base-content/70 mt-1">{event.body}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-base-content/50">
                          <span>Agent: {event.sourceAgent}</span>
                          <span>
                            {new Date(event.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </span>
                          {event.cid && <span>IPFS: {event.cid.substring(0, 12)}…</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={eventsEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
