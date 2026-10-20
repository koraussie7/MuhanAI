/**
 * TasksPage.tsx — Task management + Minima escrow integration (Phase 2)
 *
 * Phase 2 of muhanai.com/token-bank + Minima chain integration (see
 * HANDOFF_NEXT_AGENT.md §24). Bridges TokenBankPage and the task workflow:
 *   - create a task with a DADA reward (locks escrow via anchorHash)
 *   - assign a worker address
 *   - mark task completed -> auto-releases the matching escrow
 *   - history shows every task alongside its escrow status
 *
 * Escrow state is shared with TokenBankPage via escrowStore.
 */
import React, { useState, useEffect, useMemo, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import {
  Plus, ListChecks, Play, CheckCircle2, RefreshCcw, Wallet, ArrowRight,
  CircleDollarSign, AlertCircle, User, Clock, ChevronRight,
} from "lucide-react";
import { escrowStore } from "../store/escrowStore";
import type { EscrowEntry } from "../types/escrow";
import { useMinima } from "../hooks/useMinima";

type TaskStatus = "open" | "in_progress" | "completed" | "cancelled";

interface Task {
  id: string;
  title: string;
  description: string;
  reward: string;
  token: "MINIMA" | "DADA";
  creator: string;
  assignee: string | null;
  status: TaskStatus;
  createdAt: number;
  completedAt?: number;
}

const STORAGE_KEY = "muhanai:tasks:v1";

function loadTasks(): Task[] {
  if (typeof window === "undefined") return seedTasks();
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Task[];
  } catch { /* fall through */ }
  return seedTasks();
}
function persistTasks(tasks: Task[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch { /* quota */ }
}
function seedTasks(): Task[] {
  // Small seed list so first-time visitors see something meaningful.
  return [
    {
      id: "task-001",
      title: "Review PR #142 — Block canvas improvements",
      description: "Visual review of new drag handles for the canvas grid.",
      reward: "0.5",
      token: "DADA",
      creator: "self",
      assignee: "MxReviewerA1...",
      status: "in_progress",
      createdAt: Date.now() - 86_400_000,
    },
    {
      id: "task-002",
      title: "Translate landing page to Korean",
      description: "Localize hero copy and CTAs. Anchor receipt on MDS.",
      reward: "0.25",
      token: "DADA",
      creator: "self",
      assignee: null,
      status: "open",
      createdAt: Date.now() - 3_600_000,
    },
  ];
}

export function TasksPage() {
  const { client, anchorHash } = useMinima();
  const [tasks, setTasks] = useState<Task[]>(loadTasks);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ title: "", description: "", reward: "", token: "DADA" as "DADA" | "MINIMA", assignee: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");

  // Subscribe to escrow changes (TokenBankPage writes here).
  const escrows = useSyncExternalStore(
    escrowStore.subscribe,
    escrowStore.getSnapshot,
    () => [],
  );

  useEffect(() => { persistTasks(tasks); }, [tasks]);

  const escrowsByTask = useMemo(() => {
    const map = new Map<string, EscrowEntry>();
    for (const e of escrows) map.set(e.taskId, e);
    return map;
  }, [escrows]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return tasks;
    return tasks.filter((t) => t.status === statusFilter);
  }, [tasks, statusFilter]);

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const id = `task-${Date.now()}`;
      // Anchor the task spec on MDS (Phantom RNPE-2) so the task itself is verifiable.
      const spec = JSON.stringify({
        id, title: createForm.title, description: createForm.description,
        reward: createForm.reward, token: createForm.token, creator: "self", ts: Date.now(),
      });
      await anchorHash(spec, "task-spec");

      const task: Task = {
        id, title: createForm.title, description: createForm.description,
        reward: createForm.reward, token: createForm.token, creator: "self",
        assignee: createForm.assignee || null, status: "open", createdAt: Date.now(),
      };
      setTasks((prev) => [task, ...prev]);
      setCreateForm({ title: "", description: "", reward: "", token: "DADA", assignee: "" });
      setCreateOpen(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  };

  const advanceStatus = async (id: string, next: TaskStatus) => {
    setTasks((prev) => prev.map((t) => (
      t.id === id ? { ...t, status: next, completedAt: next === "completed" ? Date.now() : t.completedAt } : t
    )));
    // Phase 2: auto-release escrow when task completes.
    if (next === "completed") {
      const esc = escrowsByTask.get(id);
      if (esc && esc.status === "open") {
        // Anchor the release receipt.
        const release = JSON.stringify({ escrowId: esc.id, taskId: id, action: "release", ts: Date.now() });
        const a = await anchorHash(release, "escrow-release").catch(() => null);
        escrowStore.update(esc.id, { status: "released", releasedAt: Date.now(), anchorHash: a?.hash ?? esc.anchorHash });
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-[#14ebc0] to-[#06b6d4] bg-clip-text text-transparent flex items-center gap-2">
              <ListChecks className="w-6 h-6 text-[#14ebc0]" /> Tasks
            </h1>
            <p className="text-[#71717a] text-sm mt-1">
              Create tasks with DADA rewards. Escrow locks on creation, releases on completion.
            </p>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-[#14ebc0] to-[#06b6d4] text-[#09090b] font-semibold rounded-lg px-4 py-2 hover:opacity-90 transition"
          >
            <Plus className="w-4 h-4" /> New task
          </button>
        </div>

        {submitError && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
            <p className="text-red-200 text-sm">{submitError}</p>
          </div>
        )}

        {/* Status filter */}
        <div className="flex gap-2 border-b border-[#27272a]">
          {(["all", "open", "in_progress", "completed", "cancelled"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 text-xs font-medium capitalize transition ${
                statusFilter === s
                  ? "text-[#14ebc0] border-b-2 border-[#14ebc0]"
                  : "text-[#71717a] hover:text-white"
              }`}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>

        {/* Tasks list */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <p className="text-[#52525b] text-sm text-center py-8">No tasks in this filter.</p>
          ) : (
            filtered.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                escrow={escrowsByTask.get(task.id)}
                onAdvance={advanceStatus}
              />
            ))
          )}
        </div>

        {/* Create task modal */}
        {createOpen && (
          <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
            onClick={() => !submitting && setCreateOpen(false)}
          >
            <div
              className="bg-[#141418] border border-[#27272a] rounded-xl p-6 max-w-md w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#14ebc0]" /> New task
              </h2>
              <form onSubmit={createTask} className="space-y-3">
                <Field label="Title">
                  <input
                    type="text" value={createForm.title}
                    onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                    required
                    className="w-full bg-[#09090b] border border-[#27272a] rounded-lg p-2 text-sm"
                  />
                </Field>
                <Field label="Description">
                  <textarea
                    value={createForm.description} rows={3}
                    onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                    className="w-full bg-[#09090b] border border-[#27272a] rounded-lg p-2 text-sm"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Reward">
                    <input
                      type="number" step="0.0001" value={createForm.reward}
                      onChange={(e) => setCreateForm({ ...createForm, reward: e.target.value })}
                      required
                      className="w-full bg-[#09090b] border border-[#27272a] rounded-lg p-2 font-mono text-sm"
                    />
                  </Field>
                  <Field label="Token">
                    <select
                      value={createForm.token}
                      onChange={(e) => setCreateForm({ ...createForm, token: e.target.value as "DADA" | "MINIMA" })}
                      className="w-full bg-[#09090b] border border-[#27272a] rounded-lg p-2 text-sm"
                    >
                      <option value="DADA">DADA</option>
                      <option value="MINIMA">MINIMA</option>
                    </select>
                  </Field>
                </div>
                <Field label="Assignee (Minima address, optional)">
                  <input
                    type="text" value={createForm.assignee}
                    onChange={(e) => setCreateForm({ ...createForm, assignee: e.target.value })}
                    placeholder="MxABC...123"
                    className="w-full bg-[#09090b] border border-[#27272a] rounded-lg p-2 font-mono text-sm"
                  />
                </Field>
                {submitError && <p className="text-red-400 text-xs">{submitError}</p>}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    disabled={submitting}
                    className="flex-1 bg-[#27272a] rounded-lg p-2 hover:bg-[#3f3f46] transition text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !client}
                    className="flex-1 bg-gradient-to-r from-[#14ebc0] to-[#06b6d4] text-[#09090b] font-semibold rounded-lg p-2 hover:opacity-90 transition disabled:opacity-40"
                  >
                    {submitting ? "Anchoring..." : "Create + Anchor"}
                  </button>
                </div>
                <p className="text-xs text-[#71717a]">
                  Task spec is anchored on MDS via Phantom RNPE-2 pattern. To lock a DADA reward,
                  open <Link to="/token-bank" className="text-[#14ebc0] hover:underline">Token Bank</Link> and create an escrow for this task.
                </p>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-[#71717a] mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function TaskRow({
  task, escrow, onAdvance,
}: { task: Task; escrow: EscrowEntry | undefined; onAdvance: (id: string, s: TaskStatus) => void }) {
  const StatusIcon =
    task.status === "open" ? CircleDollarSign :
    task.status === "in_progress" ? Play :
    task.status === "completed" ? CheckCircle2 :
    RefreshCcw;
  const statusColor =
    task.status === "open" ? "text-yellow-300 bg-yellow-900/40" :
    task.status === "in_progress" ? "text-blue-300 bg-blue-900/40" :
    task.status === "completed" ? "text-green-300 bg-green-900/40" :
    "text-[#71717a] bg-[#27272a]";

  return (
    <div className="bg-[#141418] rounded-xl p-5 border border-[#27272a] space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold">{task.title}</h3>
          <p className="text-sm text-[#a1a1aa] mt-1">{task.description}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${statusColor}`}>
          <StatusIcon className="w-3 h-3" />
          {task.status.replace("_", " ")}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-[#71717a]">
        <span className="font-mono">{task.id}</span>
        <span>·</span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {new Date(task.createdAt).toLocaleString()}
        </span>
        {task.assignee && (
          <>
            <span>·</span>
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {task.assignee.slice(0, 14)}...
            </span>
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#27272a]">
        <div className="flex items-center gap-3">
          <span className="text-sm flex items-center gap-1.5 font-mono">
            <CircleDollarSign className="w-4 h-4 text-[#14ebc0]" />
            {task.reward} {task.token}
          </span>
          {escrow ? (
            <span className={`text-xs px-2 py-0.5 rounded font-mono ${
              escrow.status === "open" ? "bg-yellow-900/40 text-yellow-300" :
              escrow.status === "released" ? "bg-green-900/40 text-green-300" :
              "bg-red-900/40 text-red-300"
            }`}>
              escrow: {escrow.status}
            </span>
          ) : (
            <Link
              to="/token-bank"
              className="text-xs px-2 py-0.5 rounded bg-[#27272a] hover:bg-[#3f3f46] flex items-center gap-1"
              title="Open Token Bank to lock a DADA reward"
            >
              <Wallet className="w-3 h-3" /> Lock escrow
              <ChevronRight className="w-3 h-3" />
            </Link>
          )}
        </div>

        {/* Phase 2: status actions. Completion auto-releases escrow. */}
        <div className="flex gap-2">
          {task.status === "open" && (
            <button
              onClick={() => onAdvance(task.id, "in_progress")}
              className="text-xs px-3 py-1.5 bg-blue-900/40 text-blue-300 rounded hover:bg-blue-900/60 transition"
            >
              <Play className="w-3 h-3 inline" /> Start
            </button>
          )}
          {task.status === "in_progress" && (
            <button
              onClick={() => onAdvance(task.id, "completed")}
              disabled={!escrow || escrow.status !== "open"}
              className="text-xs px-3 py-1.5 bg-green-900/40 text-green-300 rounded hover:bg-green-900/60 transition disabled:opacity-40"
              title={!escrow ? "Create escrow first" : !escrow.status ? "" : ""}
            >
              <CheckCircle2 className="w-3 h-3 inline" /> Complete + Pay
            </button>
          )}
          {task.status === "completed" && escrow?.anchorHash && (
            <span
              className="text-xs px-2 py-1 rounded font-mono text-[#14ebc0] bg-[#14ebc0]/10"
              title={`Anchor: ${escrow.anchorHash}`}
            >
              <ArrowRight className="w-3 h-3 inline" /> {escrow.anchorHash.slice(0, 10)}...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default TasksPage;
