/**
 * SafetyPipelinePage.tsx — 5-stage safety pipeline visualizer.
 *
 * Source: proposal-bridge's runPipeline() + PipelineEvent stream.
 *
 * Renders the 5 stages (ingest → decide → submit → await → complete) as
 * a horizontal stepper. Each event tick adds a row to the timeline below.
 *
 * In production this page subscribes to a WebSocket stream from a
 * server-side runPipeline caller. For standalone demo, the page can
 * drive its own proposals via the demo runner below.
 */
import * as React from "react";
import {
  runPipeline,
  synopsis,
  createRecordingExecutor,
  type PipelineEvent,
  type PipelineStage,
  type Proposal,
} from "../../../../packages/proposal-bridge/src/index.ts";
import {
  createInbox,
  createMemoryAuditLogger,
} from "../../../../packages/busabase-adapter/src/index.ts";
import {
  createWorkspace,
  DADABOT_SCHEMAS,
} from "../../../../packages/affine-adapter/src/index.ts";
import { DashboardShell } from "../components/DashboardShell.tsx";

const STAGES: PipelineStage[] = ["ingest", "decide", "submit", "await", "complete"];

function StageBar({ currentStage }: { currentStage: PipelineStage | null }): React.ReactElement {
  // Find the index of the current stage (and mark earlier ones as completed)
  const idx = currentStage ? STAGES.indexOf(currentStage) : -1;
  return (
    <div className="ddb-stage-bar" data-testid="stage-bar" style={{
      display: "grid",
      gridTemplateColumns: `repeat(${STAGES.length}, 1fr)`,
      gap: 8,
      marginBottom: 24,
    }}>
      {STAGES.map((s, i) => {
        const isDone = i < idx;
        const isActive = i === idx;
        return (
          <div
            key={s}
            className={`ddb-stage ddb-stage--${isDone ? "done" : isActive ? "active" : "pending"}`}
            data-testid={`stage-${s}`}
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              textAlign: "center",
              fontSize: 13,
              fontWeight: 600,
              background: isDone ? "#d1fae5" : isActive ? "#ddd6fe" : "#f5f5f4",
              color: isDone ? "#065f46" : isActive ? "#5b21b6" : "#737373",
              border: isActive ? "2px solid var(--ddb-accent)" : "1px solid transparent",
              transition: "all 200ms ease",
            }}
          >
            {isDone ? "✓" : isActive ? "⏳" : "·"} {s}
          </div>
        );
      })}
    </div>
  );
}

function TimelineRow({ event }: { event: PipelineEvent }): React.ReactElement {
  const time = new Date(event.at).toLocaleTimeString();
  return (
    <div
      className="ddb-timeline-row"
      data-testid={`timeline-${event.stage}`}
      style={{
        display: "grid",
        gridTemplateColumns: "80px 80px 1fr",
        padding: "8px 12px",
        borderBottom: "1px solid var(--ddb-border)",
        fontSize: 13,
        fontFamily: "ui-monospace, SF Mono, monospace",
      }}
    >
      <span style={{ color: "var(--ddb-text-mute)" }}>{time}</span>
      <span className={`ddb-tag ddb-tag--${event.stage === "error" ? "rejected" : "open"}`}>
        {event.stage}
      </span>
      <span>{event.detail ?? (event.error?.message ?? "")}</span>
    </div>
  );
}

/**
 * Demo runner: drives a synthetic proposal through the pipeline so the
 * page can be tested without a real WebSocket source. Drop in production
 * by removing this effect and subscribing to a server stream.
 */
async function runDemoProposal(
  proposal: Proposal,
  onEvent: (e: PipelineEvent) => void,
): Promise<void> {
  const inbox = createInbox();
  const workspace = createWorkspace({ id: "safety-demo", schema: DADABOT_SCHEMAS });
  const audit = createMemoryAuditLogger();
  const executor = createRecordingExecutor();

  await runPipeline(
    proposal,
    { inbox, workspace, audit, autoMergeAcknowledged: true },
    {
      onEvent,
      awaitDecision: async () => "approve",
      executor: executor.apply,
    },
  );
}

const DEMO_PROPOSALS: Proposal[] = [
  {
    id: "demo-1",
    agent: { name: "claude-sonnet", version: "0.1.0", modelProvider: "anthropic", modelId: "claude-sonnet-4.5" },
    title: "Refactor FindPage to use sam-tools free models",
    rationale: "Reduce API cost by routing read-only calls to free model rotator. Reversible via git revert.",
    confidence: 0.92,
    reversible: true,
    kind: "file_edit",
    files: [
      { path: "apps/web/src/routes/FindPage.tsx", operation: "modify", content: "// patched", linesAdded: 12, linesRemoved: 7 },
    ],
    toolCalls: [],
    createdAt: Date.now(),
  },
  {
    id: "demo-2",
    agent: { name: "claude-sonnet", version: "0.1.0", modelProvider: "anthropic", modelId: "claude-sonnet-4.5" },
    title: "Drop expired cache via shell command",
    rationale: "Cleanup stale cache files in /tmp to free disk space.",
    confidence: 0.4,
    reversible: false,
    kind: "shell_command",
    files: [{ path: "/tmp/dadabot-cache", operation: "delete", linesAdded: 0, linesRemoved: 0 }],
    toolCalls: [],
    createdAt: Date.now(),
  },
];

export interface SafetyPipelinePageProps {
  /** Override the WebSocket URL for production */
  websocketUrl?: string;
  /** Custom event source (for testing) */
  eventSource?: { subscribe: (cb: (e: PipelineEvent) => void) => () => void };
}

export function SafetyPipelinePage(props: SafetyPipelinePageProps): React.ReactElement {
  const [events, setEvents] = React.useState<PipelineEvent[]>([]);
  const [running, setRunning] = React.useState(false);

  const currentStage = events.length > 0 ? events[events.length - 1]?.stage ?? null : null;

  React.useEffect(() => {
    if (!props.eventSource) return;
    return props.eventSource.subscribe((e) => setEvents((prev) => [...prev, e]));
  }, [props.eventSource]);

  const runDemo = async (proposal: Proposal) => {
    setRunning(true);
    setEvents([]);
    try {
      await runDemoProposal(proposal, (e) =>
        setEvents((prev) => [...prev, e]),
      );
    } finally {
      setRunning(false);
    }
  };

  const liveSynopsis = events.length > 0
    ? synopsis({
        id: "live",
        agent: { name: "x", version: "0", modelProvider: "y", modelId: "z" },
        title: "Live proposal",
        rationale: "Live from event stream",
        confidence: 0.9,
        reversible: true,
        kind: "file_edit",
        files: [],
        toolCalls: [],
        createdAt: Date.now(),
      })
    : null;

  return (
    <DashboardShell activePath="/safety">
      <h1 className="ddb-page-title">Safety Pipeline</h1>
      <p className="ddb-page-subtitle">
        5-stage transparent AI safety: ingest → decide → submit → await → complete
      </p>

      <StageBar currentStage={currentStage} />

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          className="ddb-btn ddb-btn--approve"
          onClick={() => runDemo(DEMO_PROPOSALS[0]!)}
          disabled={running}
          data-testid="run-demo-safe"
        >
          {running ? "Running…" : "▶ Run safe demo (file_edit, conf 0.92)"}
        </button>
        <button
          className="ddb-btn ddb-btn--reject"
          onClick={() => runDemo(DEMO_PROPOSALS[1]!)}
          disabled={running}
          data-testid="run-demo-critical"
        >
          {running ? "Running…" : "▶ Run critical demo (shell_command, conf 0.4)"}
        </button>
      </div>

      <div className="ddb-card" style={{ padding: 0 }}>
        <header style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--ddb-border)",
          fontSize: 14,
          fontWeight: 600,
        }}>
          Timeline ({events.length} event{events.length === 1 ? "" : "s"})
        </header>
        {events.length === 0 ? (
          <p style={{ padding: 24, textAlign: "center", color: "var(--ddb-text-mute)", margin: 0 }}>
            No events yet. Run a demo above to see the pipeline live.
          </p>
        ) : (
          events.map((e, i) => <TimelineRow key={i} event={e} />)
        )}
      </div>

      {liveSynopsis && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--ddb-text-mute)" }}>
            Latest synopsis (risk: {liveSynopsis.riskTag})
          </summary>
          <pre className="ddb-card__files">{liveSynopsis.body}</pre>
        </details>
      )}
    </DashboardShell>
  );
}
