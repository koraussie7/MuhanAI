/**
 * Pythia Full Dashboard — muhanai.com/pythia
 *
 * The complete board for the Pythia Python coding agent. Modeled on the
 * dashboard-v2 information architecture (toolbar -> KPI strip -> live ticker
 * -> two-column workspace -> session table) but built as a typed React route
 * so it shares the pythia-client layer, typechecking, and tests.
 *
 * Data sources (all optional — every panel degrades independently):
 *   POST /api/pythia/session    run an analysis
 *   GET  /api/pythia/sessions   session history
 *   GET  /api/pythia/models     model catalog (OmniRoute -> static fallback)
 *   GET  /api/pythia/providers  keyless provider list
 *   GET  /api/pythia/graph/{concepts,relations,events}  cosmic graph
 */

import { Activity, Code2, Cpu, FileCode, Network, RefreshCw, Zap } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	type GraphConcept,
	type GraphEvent,
	type GraphRelation,
	type PythiaSession,
	type PythiaSessionResult,
	listGraphConcepts,
	listGraphEvents,
	listGraphRelations,
	listPythiaModels,
	listPythiaProviders,
	listPythiaSessions,
	runPythiaSession,
	stopPythiaSession,
} from "../lib/pythia-client";
import { fetchWorldBrief, type WorldBrief } from "../lib/world-client";
import { LiveTicker, type TickerItem } from "./LiveTicker";
import { PythiaVisualCanvas } from "./PythiaVisualCanvas";

type StatusFilter = "all" | "raw" | "validated" | "amplified";

const STATUS_LABEL: Record<StatusFilter, string> = {
	all: "전체",
	raw: "Raw",
	validated: "Validated",
	amplified: "Amplified",
};

/** signalScore is unbounded in principle; clamp for the bar visual. */
function scorePercent(score: number): number {
	return Math.max(0, Math.min(100, Math.round(score)));
}

function truncate(text: string, max: number): string {
	const clean = text.replace(/\s+/g, " ").trim();
	return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export const PythiaPage: React.FC = () => {
	// --- composer state ---
	const [file, setFile] = useState("app.py");
	const [prompt, setPrompt] = useState("");
	const [models, setModels] = useState<string[]>(["auto"]);
	const [model, setModel] = useState("auto");
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<PythiaSessionResult | null>(null);
	const [error, setError] = useState<string | null>(null);

	// --- board state ---
	const [sessions, setSessions] = useState<PythiaSession[]>([]);
	const [providers, setProviders] = useState<string[]>([]);
	const [concepts, setConcepts] = useState<GraphConcept[]>([]);
	const [relations, setRelations] = useState<GraphRelation[]>([]);
	const [events, setEvents] = useState<GraphEvent[]>([]);
	const [worldBrief, setWorldBrief] = useState<WorldBrief | null>(null);
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [refreshing, setRefreshing] = useState(false);

	const loadBoard = useCallback(async () => {
		setRefreshing(true);
		try {
			// Each call self-degrades to a fallback, so no single failure
			// should blank the whole board.
			const [nextSessions, nextConcepts, nextRelations, nextEvents, nextProviders, nextBrief] =
				await Promise.all([
					listPythiaSessions(),
					listGraphConcepts(),
					listGraphRelations(),
					listGraphEvents(),
					listPythiaProviders(),
					fetchWorldBrief().catch(() => null),
				]);
			setSessions(nextSessions);
			setConcepts(nextConcepts);
			setRelations(nextRelations);
			setEvents(nextEvents);
			setProviders(nextProviders);
			if (nextBrief) setWorldBrief(nextBrief);
		} finally {
			setRefreshing(false);
		}
	}, []);

	useEffect(() => {
		void loadBoard();
		listPythiaModels()
			.then((list) => {
				if (list.length === 0) return;
				setModels(list);
				if (!list.includes("auto")) setModel(list[0] ?? "auto");
			})
			.catch(() => {
				// keep the ["auto"] default
			});
	}, [loadBoard]);

	// --- derived ---

	const filteredConcepts = useMemo(
		() =>
			statusFilter === "all"
				? concepts
				: concepts.filter((c) => c.effectiveStatus === statusFilter),
		[concepts, statusFilter],
	);

	const statusCounts = useMemo(() => {
		const counts = { raw: 0, validated: 0, amplified: 0 };
		for (const c of concepts) counts[c.effectiveStatus] += 1;
		return counts;
	}, [concepts]);

	const avgSignal = useMemo(() => {
		if (concepts.length === 0) return 0;
		const total = concepts.reduce((sum, c) => sum + c.signalScore, 0);
		return Math.round(total / concepts.length);
	}, [concepts]);

	const tickerItems = useMemo<TickerItem[]>(() => {
		const items: TickerItem[] = [];
		if (result) {
			items.push({ id: "last-provider", label: "provider", value: result.provider, tone: "sky" });
			items.push({ id: "last-latency", label: "latency", value: `${result.latencyMs}ms`, tone: "sky" });
		}
		items.push({ id: "sessions", label: "sessions", value: String(sessions.length), tone: "muted" });
		items.push({ id: "concepts", label: "concepts", value: String(concepts.length), tone: "sky" });
		items.push({ id: "relations", label: "relations", value: String(relations.length), tone: "muted" });
		items.push({
			id: "amplified",
			label: "amplified",
			value: String(statusCounts.amplified),
			tone: "amber",
		});
		items.push({ id: "cost", label: "cost", value: "0 MHT", tone: "sky" });
		return items;
	}, [result, sessions.length, concepts.length, relations.length, statusCounts.amplified]);

	// --- actions ---

	const handleRun = useCallback(async () => {
		if (!prompt.trim()) return;
		setLoading(true);
		setError(null);
		try {
			const data = await runPythiaSession({ file, prompt, model });
			setResult(data);
			setSessions((prev) => [
				{
					id: data.sessionId,
					file: data.file,
					prompt,
					status: "completed",
					provider: data.provider,
					createdAt: new Date().toISOString(),
				},
				...prev,
			]);
			// The analysis seeded new graph concepts — pull them in.
			void loadBoard();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setError(
				/40[13]/.test(message)
					? "Gateway가 요청을 거부했습니다. 세션을 확인한 뒤 다시 시도하세요."
					: "모든 키리스 제공자가 실패했습니다. 잠시 후 다시 시도하세요.",
			);
		} finally {
			setLoading(false);
			setPrompt("");
		}
	}, [file, prompt, model, loadBoard]);

	const handleStop = useCallback(async (sessionId: string) => {
		try {
			await stopPythiaSession(sessionId);
			setSessions((prev) => prev.filter((s) => s.id !== sessionId));
		} catch {
			// optimistic removal already applied; a failed DELETE just means the
			// server-side session lingers until restart
		}
	}, []);

	const isOnline = result !== null || sessions.length > 0;

	return (
		<div className="pythia-board">
			{/* ── toolbar ─────────────────────────────────────────────── */}
			<div className="pythia-toolbar">
				<span
					className={`pythia-chip ${isOnline ? "pythia-chip--online" : "pythia-chip--offline"}`}
				>
					<span className="pythia-chip__dot" aria-hidden="true" />
					{isOnline ? "GATEWAY ONLINE" : "IDLE"}
				</span>
				<span className="pythia-chip">TIER · KEYLESS</span>
				<span className="pythia-chip">{providers.length} PROVIDERS</span>
				<span className="pythia-chip">{models.length} MODELS</span>

				<span className="pythia-toolbar__spacer" />

				<button
					type="button"
					className="pythia-btn"
					onClick={() => void loadBoard()}
					disabled={refreshing}
				>
					<RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
					{refreshing ? "동기화 중…" : "새로고침"}
				</button>
			</div>

			{/* ── live ticker ─────────────────────────────────────────── */}
			<LiveTicker items={tickerItems} />

			{/* ── KPI strip ───────────────────────────────────────────── */}
			<div className="pythia-kpis">
				<div className="pythia-kpi">
					<span className="pythia-kpi__label">Sessions</span>
					<span className="pythia-kpi__value">{sessions.length}</span>
					<span className="pythia-kpi__hint">이번 런타임</span>
				</div>
				<div className="pythia-kpi">
					<span className="pythia-kpi__label">Concepts</span>
					<span className="pythia-kpi__value">{concepts.length}</span>
					<span className="pythia-kpi__hint">cosmic graph</span>
				</div>
				<div className="pythia-kpi">
					<span className="pythia-kpi__label">Relations</span>
					<span className="pythia-kpi__value">{relations.length}</span>
					<span className="pythia-kpi__hint">derived edges</span>
				</div>
				<div className="pythia-kpi">
					<span className="pythia-kpi__label">Avg Signal</span>
					<span className="pythia-kpi__value">{avgSignal}</span>
					<span className="pythia-kpi__hint">amplification score</span>
				</div>
				<div className="pythia-kpi">
					<span className="pythia-kpi__label">Cost</span>
					<span className="pythia-kpi__value">0</span>
					<span className="pythia-kpi__hint">MHT · token-free</span>
				</div>
			</div>

			{/* ── Visual Centerpiece (2D Topology Mesh / 3D World Globe) ─ */}
			<PythiaVisualCanvas
				concepts={concepts}
				relations={relations}
				worldBrief={worldBrief}
				onSelectConcept={(name) => {
					setPrompt((prev) => (prev ? `${prev}\n[참조 개념] ${name}` : `[참조 개념] ${name} 분석 및 파생 예측: `));
				}}
			/>

			{/* ── workspace ───────────────────────────────────────────── */}
			<div className="pythia-workspace">
				{/* left: composer + response */}
				<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
					<div className="pythia-card">
						<div className="pythia-card__head">
							<Zap size={14} style={{ color: "#38bdf8" }} />
							<h3 className="pythia-card__title">Python 분석 요청</h3>
						</div>

						<div className="prompt-model-pills">
							<span
								style={{
									fontSize: 11,
									color: "var(--cline-text-muted)",
									fontWeight: 600,
									textTransform: "uppercase",
								}}
							>
								Target
							</span>
							<FileCode size={14} style={{ color: "#38bdf8" }} />
							<input
								type="text"
								value={file}
								onChange={(e) => setFile(e.target.value)}
								placeholder="app.py"
								style={{
									background: "var(--cline-bg-tertiary, rgba(255,255,255,0.05))",
									border: "1px solid var(--cline-border, rgba(255,255,255,0.1))",
									borderRadius: 6,
									padding: "4px 8px",
									color: "var(--cline-text)",
									fontSize: 13,
									minWidth: 140,
								}}
							/>
						</div>

						<div className="prompt-model-pills">
							<span
								style={{
									fontSize: 11,
									color: "var(--cline-text-muted)",
									fontWeight: 600,
									textTransform: "uppercase",
								}}
							>
								Model
							</span>
							<Cpu size={14} style={{ color: "#38bdf8" }} />
							<select
								value={model}
								onChange={(e) => setModel(e.target.value)}
								style={{
									background: "var(--cline-bg-tertiary, rgba(255,255,255,0.05))",
									border: "1px solid var(--cline-border, rgba(255,255,255,0.1))",
									borderRadius: 6,
									padding: "4px 8px",
									color: "var(--cline-text)",
									fontSize: 13,
									minWidth: 180,
								}}
							>
								{models.map((m) => (
									<option key={m} value={m}>
										{m}
									</option>
								))}
							</select>
						</div>

						<textarea
							className="prompt-input"
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
									e.preventDefault();
									void handleRun();
								}
							}}
							placeholder="Python 코드 분석/수정 요청을 설명해주세요… (Cmd+Enter로 전송)"
							rows={5}
							style={{ resize: "vertical", minHeight: 96 }}
						/>

						<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
							<button
								type="button"
								className="pythia-btn pythia-btn--primary"
								onClick={() => void handleRun()}
								disabled={loading || !prompt.trim()}
							>
								<Zap size={14} />
								{loading ? "Gateway 처리 중…" : "Token-Free Gateway로 실행"}
							</button>
							{result && (
								<span className="pythia-latency">
									{result.latencyMs}ms · {result.provider}
								</span>
							)}
						</div>

						{error && <div className="pythia-error">{error}</div>}
					</div>

					{result && (
						<div className="pythia-card">
							<div className="pythia-card__head">
								<Code2 size={14} style={{ color: "#38bdf8" }} />
								<h3 className="pythia-card__title">응답</h3>
								<span className="pythia-card__count">{result.cost}</span>
							</div>
							<pre className="pythia-response">{result.response}</pre>
						</div>
					)}
				</div>

				{/* right: cosmic graph panels */}
				<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
					<div className="pythia-card">
						<div className="pythia-card__head">
							<Network size={14} style={{ color: "#a5b4fc" }} />
							<h3 className="pythia-card__title">Cosmic Concepts</h3>
							<span className="pythia-card__count">{filteredConcepts.length}</span>
						</div>

						<div className="pythia-tabs">
							{(Object.keys(STATUS_LABEL) as StatusFilter[]).map((key) => (
								<button
									type="button"
									key={key}
									className="pythia-tab"
									aria-pressed={statusFilter === key}
									onClick={() => setStatusFilter(key)}
								>
									{STATUS_LABEL[key]}
									{key !== "all" ? ` ${statusCounts[key]}` : ` ${concepts.length}`}
								</button>
							))}
						</div>

						{filteredConcepts.length === 0 ? (
							<p className="pythia-empty">
								{concepts.length === 0
									? "아직 개념이 없습니다. Pythia 분석을 실행하면 cosmic graph에 시드됩니다."
									: "이 상태에 해당하는 개념이 없습니다."}
							</p>
						) : (
							<div className="pythia-list">
								{filteredConcepts.slice(0, 40).map((c) => (
									<div className={`pythia-row pythia-row--${c.effectiveStatus}`} key={c.id}>
										<div className="pythia-row__main">
											<div className="pythia-row__label">{c.label}</div>
											<div className="pythia-row__meta">
												{c.domain} · {c.effectiveStatus}
											</div>
											<div className="pythia-bar">
												<div
													className="pythia-bar__fill"
													style={{ width: `${scorePercent(c.signalScore)}%` }}
												/>
											</div>
										</div>
										<span className="pythia-row__score">{scorePercent(c.signalScore)}</span>
									</div>
								))}
							</div>
						)}
					</div>

					<div className="pythia-card">
						<div className="pythia-card__head">
							<Activity size={14} style={{ color: "#34d399" }} />
							<h3 className="pythia-card__title">Relations</h3>
							<span className="pythia-card__count">{relations.length}</span>
						</div>
						{relations.length === 0 ? (
							<p className="pythia-empty">파생된 관계가 아직 없습니다.</p>
						) : (
							<div className="pythia-list">
								{relations.slice(0, 20).map((r) => (
									<div className="pythia-row pythia-row--validated" key={r.id}>
										<div className="pythia-row__main">
											<div className="pythia-row__label">
												{r.sourceId} → {r.targetId}
											</div>
											<div className="pythia-row__meta">{r.predicate}</div>
										</div>
										<span className="pythia-row__score">{r.strength.toFixed(2)}</span>
									</div>
								))}
							</div>
						)}
					</div>

					<div className="pythia-card">
						<div className="pythia-card__head">
							<Activity size={14} style={{ color: "#94a3b8" }} />
							<h3 className="pythia-card__title">Log Tail</h3>
							<span className="pythia-card__count">{events.length}</span>
						</div>
						{events.length === 0 ? (
							<p className="pythia-empty">cosmic log이 비어 있습니다.</p>
						) : (
							<div className="pythia-list">
								{events.slice(0, 20).map((e) => (
									<div className="pythia-row pythia-row--raw" key={e.id}>
										<div className="pythia-row__main">
											<div className="pythia-row__label">{e.kind}</div>
											<div className="pythia-row__meta">
												{e.source} · {truncate(e.timestamp, 24)}
											</div>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			</div>

			{/* ── sessions ────────────────────────────────────────────── */}
			<div className="pythia-card">
				<div className="pythia-card__head">
					<Code2 size={14} style={{ color: "#38bdf8" }} />
					<h3 className="pythia-card__title">Active Sessions</h3>
					<span className="pythia-card__count">{sessions.length}</span>
				</div>
				{sessions.length === 0 ? (
					<p className="pythia-empty">
						활성 세션이 없습니다. 위에서 분석을 실행하거나 CLI에서{" "}
						<code>POST /api/pythia/session</code>을 호출하세요.
					</p>
				) : (
					<div className="pythia-list">
						{sessions.map((s) => (
							<div className="pythia-session" key={s.id}>
								<span className="pythia-session__file">{s.file}</span>
								<span className="pythia-session__prompt">{truncate(s.prompt, 70)}</span>
								<span className="pythia-session__provider">{s.provider}</span>
								<button
									type="button"
									className="pythia-session__stop"
									onClick={() => void handleStop(s.id)}
								>
									Stop
								</button>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

export default PythiaPage;
