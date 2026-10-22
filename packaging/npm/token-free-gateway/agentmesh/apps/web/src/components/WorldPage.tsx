import { Activity, RefreshCw, Sparkles } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t, useI18n } from "../i18n";
import { factCheckWorldEvent, pythiaSummarizeBrief } from "../lib/pythia-integration";
import { OntologyGraphPanel } from "./OntologyGraphPanel";
import { WorldGlobe } from "./WorldGlobe";

/**
 * World page — globe.gl 3D globe + Pythia world brief.
 *
 * This is the "globe only" build. It intentionally depends on nothing outside
 * React/lucide/globe.gl: the previous version imported `@agentmesh/peer-mesh`,
 * which reaches `credit-system/security.ts`, whose Node-only `crypto`/`util`
 * imports resolve to throwing browser stubs. That made the page throw during
 * render, and with no ErrorBoundary above it React tore the whole app down —
 * the symptom was an empty `<div id="root">` on /world.
 *
 * The mesh views were built on peer-mesh data, so they are gone for now. What
 * remains is the part that does not need them: the live brief, the event feed,
 * predictions and the 3D globe.
 *
 * The ontology sidebar (OntologyGraphPanel) is back, but it talks to
 * @ontograph/core over HTTP through `lib/ontograph-integration` rather than
 * reaching into peer-mesh, so it keeps the "no Node-only imports" guarantee.
 * Selecting an entity with coordinates flies the globe to that position.
 */

interface WorldEvent {
	id: string;
	title: string;
	domain: string;
	location?: string;
	severity: "info" | "watch" | "alert";
	source: string;
	timestamp: string;
}

interface WorldPrediction {
	id: string;
	title: string;
	horizon: "24h" | "1w" | "1m" | "1y";
	probability: number;
	confidence: number;
	rationale: string;
}

interface WorldBrief {
	source: "pythia" | "offline";
	summary: string;
	domains: string[];
	events: WorldEvent[];
	predictions: WorldPrediction[];
	fetchedAt: string;
}

function severityColor(severity: WorldEvent["severity"]): string {
	if (severity === "alert") return "var(--cline-rose, #f43f5e)";
	if (severity === "watch") return "var(--cline-amber, #f59e0b)";
	return "var(--cline-green, #10b981)";
}

function probabilityColor(p: number): string {
	if (p >= 0.7) return "var(--cline-rose, #f43f5e)";
	if (p >= 0.4) return "var(--cline-amber, #f59e0b)";
	return "var(--cline-green, #10b981)";
}

function isWorldEvent(value: unknown): value is WorldEvent {
	if (!value || typeof value !== "object") return false;
	const e = value as Record<string, unknown>;
	return (
		typeof e.id === "string" &&
		typeof e.title === "string" &&
		typeof e.domain === "string" &&
		typeof e.timestamp === "string" &&
		typeof e.source === "string" &&
		(e.severity === "info" || e.severity === "watch" || e.severity === "alert")
	);
}

function isWorldPrediction(value: unknown): value is WorldPrediction {
	if (!value || typeof value !== "object") return false;
	const p = value as Record<string, unknown>;
	return (
		typeof p.id === "string" &&
		typeof p.title === "string" &&
		(p.horizon === "24h" || p.horizon === "1w" || p.horizon === "1m" || p.horizon === "1y") &&
		typeof p.probability === "number" &&
		typeof p.confidence === "number" &&
		typeof p.rationale === "string"
	);
}

/** Normalizes whatever the API returns into a WorldBrief we can render. */
export function normalizeBrief(payload: unknown): WorldBrief {
	const p = (payload ?? {}) as Partial<WorldBrief>;
	return {
		source: p.source === "pythia" ? "pythia" : "offline",
		summary: typeof p.summary === "string" ? p.summary : "World brief is unavailable.",
		domains: Array.isArray(p.domains)
			? p.domains.filter((d): d is string => typeof d === "string")
			: [],
		events: Array.isArray(p.events) ? p.events.filter(isWorldEvent) : [],
		predictions: Array.isArray(p.predictions) ? p.predictions.filter(isWorldPrediction) : [],
		fetchedAt: typeof p.fetchedAt === "string" ? p.fetchedAt : new Date().toISOString(),
	};
}

/** Fixture used when the API is unreachable, so the page is never blank. */
export function offlineBrief(): WorldBrief {
	return {
		source: "offline",
		summary: t.world.offlineSummary,
		domains: ["conflict", "disaster", "weather", "cyber", "infrastructure", "markets"],
		events: [],
		predictions: [],
		fetchedAt: new Date().toISOString(),
	};
}

export const WorldPage: React.FC = () => {
	const { t } = useI18n();
	const HORIZONS = useMemo<ReadonlyArray<{ key: WorldPrediction["horizon"]; label: string }>>(
		() => [
			{ key: "24h", label: t.world.horizon24h },
			{ key: "1w", label: t.world.horizon1w },
			{ key: "1m", label: t.world.horizon1m },
			{ key: "1y", label: t.world.horizon1y },
		],
		[t],
	);
	const [brief, setBrief] = useState<WorldBrief | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [horizon, setHorizon] = useState<WorldPrediction["horizon"]>("1w");
	const [selectedEntity, setSelectedEntity] = useState<{
		id: string;
		label: string;
		type: string;
		latitude?: number;
		longitude?: number;
	} | null>(null);
	const [factChecking, setFactChecking] = useState<string | null>(null);
	const [factCheckResult, setFactCheckResult] = useState<{
		eventId: string;
		result: { summary?: string; verdict?: string; confidence?: number } | null;
	} | null>(null);
	const [factCheckError, setFactCheckError] = useState<string | null>(null);
	const [summarizing, setSummarizing] = useState(false);
	const [briefSummary, setBriefSummary] = useState<string | null>(null);
	const [summaryError, setSummaryError] = useState<string | null>(null);

	const handleFactCheck = useCallback(async (event: WorldEvent) => {
		setFactChecking(event.id);
		setFactCheckError(null);
		setFactCheckResult(null);
		try {
			const result = await factCheckWorldEvent(event);
			setFactCheckResult({ eventId: event.id, result });
		} catch (err) {
			setFactCheckError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setFactChecking(null);
		}
	}, []);
	/**
	 * Ask Pythia (via the keyless mesh) for a plain-language Korean summary of
	 * the current world brief. Result is shown under the raw summary.
	 */
	const handleSummarizeBrief = useCallback(async () => {
		if (!brief) return;
		setSummarizing(true);
		setSummaryError(null);
		try {
			const result = await pythiaSummarizeBrief(
				brief.summary,
				brief.events.map((e) => ({ title: e.title, domain: e.domain, severity: e.severity })),
			);
			setBriefSummary(result.explanation);
		} catch (err) {
			setBriefSummary(null);
			setSummaryError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setSummarizing(false);
		}
	}, [brief]);
	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/world/brief", { credentials: "include" });
			if (!res.ok) throw new Error(`World brief returned HTTP ${res.status}`);
			setBrief(normalizeBrief(await res.json()));
		} catch {
			// An unreachable engine must not blank the page — fall back to the
			// snapshot so the globe and labels still render.
			setBrief(offlineBrief());
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	// Stable references: WorldGlobe re-runs its marker effect on new arrays.
	const events = useMemo(() => brief?.events ?? [], [brief]);
	const predictions = useMemo(
		() => (brief?.predictions ?? []).filter((p) => p.horizon === horizon),
		[brief, horizon],
	);
	const live = brief?.source === "pythia";
	const focusEntity = useMemo(
		() =>
			selectedEntity
				? {
						id: selectedEntity.id,
						latitude: selectedEntity.latitude,
						longitude: selectedEntity.longitude,
					}
				: null,
		[selectedEntity],
	);

	return (
		<div className="cline-chat-container" data-testid="world-page">
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 12,
					marginBottom: 12,
					flexWrap: "wrap",
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<Activity size={16} style={{ color: "#38bdf8" }} />
					<h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--cline-text)", margin: 0 }}>
						World Intelligence
					</h2>
					<span
						data-testid="world-source-badge"
						style={{
							fontSize: 10,
							fontWeight: 700,
							letterSpacing: 0.5,
							padding: "2px 8px",
							borderRadius: 999,
							border: `1px solid ${live ? "#10b981" : "#f59e0b"}`,
							color: live ? "#10b981" : "#f59e0b",
							background: live ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
						}}
					>
						{live ? "LIVE" : "OFFLINE"}
					</span>
				</div>
				<button
					type="button"
					onClick={() => load()}
					disabled={loading}
					style={{
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
						fontSize: 12,
						padding: "4px 12px",
						borderRadius: 999,
						cursor: loading ? "default" : "pointer",
						border: "1px solid var(--cline-border, rgba(255,255,255,0.1))",
						background: "transparent",
						color: "var(--cline-text-muted)",
						opacity: loading ? 0.6 : 1,
					}}
				>
					<RefreshCw size={12} className={loading ? "animate-spin" : undefined} />
					{loading ? t.world.refreshing : t.world.refresh}
				</button>
			</div>

			{error && (
				<p style={{ fontSize: 12, color: "var(--cline-rose, #f43f5e)", marginBottom: 8 }}>
					{error}
				</p>
			)}

			{/* Globe + Ontology sidebar (2-column) */}
			<div
				style={{ display: "flex", gap: 16, marginTop: 4, flexWrap: "nowrap", overflow: "hidden" }}
			>
				<div style={{ flex: 1, minWidth: 400, maxHeight: "60vh", overflow: "hidden" }}>
					<div
						className="result-card"
						style={{ marginTop: 0, padding: 0, overflow: "hidden", height: "100%" }}
					>
						<WorldGlobe
							events={events}
							isOnline={live}
							lastUpdated={brief?.fetchedAt}
							onRefresh={load}
							focusEntity={focusEntity}
						/>
					</div>
				</div>
				<div style={{ width: 400, minWidth: 360, maxHeight: "60vh", overflow: "hidden" }}>
					<OntologyGraphPanel onEntitySelect={(e) => setSelectedEntity(e)} />
				</div>
			</div>

			{/* Brief summary */}
			{brief && (
				<div className="result-card" style={{ marginTop: 16 }}>
					<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
						<Sparkles size={14} style={{ color: "#38bdf8" }} />
						<span style={{ fontSize: 12, fontWeight: 700, color: "var(--cline-text)" }}>
							WORLD BRIEF
						</span>
					</div>
					<p style={{ fontSize: 13, color: "var(--cline-text-muted)", lineHeight: 1.6, margin: 0 }}>
						{brief.summary}
					</p>
					<button
						type="button"
						data-testid="world-brief-summarize"
						onClick={handleSummarizeBrief}
						disabled={summarizing}
						style={{
							marginTop: 10,
							fontSize: 11,
							padding: "4px 12px",
							borderRadius: 6,
							border: "1px solid rgba(56,189,248,0.4)",
							background: "rgba(56,189,248,0.1)",
							color: "#38bdf8",
							cursor: summarizing ? "default" : "pointer",
							opacity: summarizing ? 0.6 : 1,
						}}
					>
						{summarizing ? t.world.summarizing : t.world.summarizeBrief}
					</button>
					{briefSummary && (
						<div
							data-testid="world-brief-summary"
							style={{
								marginTop: 10,
								fontSize: 12,
								lineHeight: 1.6,
								color: "var(--cline-text)",
								whiteSpace: "pre-wrap",
								borderTop: "1px solid var(--cline-border, rgba(255,255,255,0.08))",
								paddingTop: 10,
							}}
						>
							{briefSummary}
						</div>
					)}
					{summaryError && (
						<div style={{ fontSize: 10, color: "var(--cline-rose, #f43f5e)", marginTop: 6 }}>
							{t.world.briefError}: {summaryError}
						</div>
					)}
					<div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
						{brief.domains.map((d) => (
							<span
								key={d}
								style={{
									fontSize: 11,
									padding: "2px 8px",
									borderRadius: 999,
									background: "rgba(56,189,248,0.12)",
									color: "#38bdf8",
								}}
							>
								{d}
							</span>
						))}
					</div>
				</div>
			)}

			<div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
				<div style={{ flex: 1, minWidth: 300 }}>
					<h3 style={{ color: "var(--cline-text)", fontSize: 14, marginBottom: 10 }}>
						{t.world.realtimeEvents(events.length)}
					</h3>
					{events.length === 0 && (
						<p style={{ color: "var(--cline-text-muted)", fontSize: 13 }}>{t.world.noEvents}</p>
					)}
					{events.slice(0, 20).map((e) => (
						<div
							key={e.id}
							style={{
								padding: "10px 14px",
								background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))",
								borderRadius: 8,
								marginBottom: 8,
								borderLeft: `3px solid ${severityColor(e.severity)}`,
							}}
						>
							<div style={{ fontSize: 13, color: "var(--cline-text)" }}>{e.title}</div>
							<div
								style={{
									fontSize: 11,
									color: "var(--cline-text-muted)",
									marginTop: 4,
									display: "flex",
									gap: 8,
								}}
							>
								<span>{e.domain}</span>
								{e.location && <span>· {e.location}</span>}
								<span>· {e.source}</span>
							</div>
							{factChecking === e.id ? (
								<button
									type="button"
									disabled
									style={{
										marginTop: 6,
										fontSize: 11,
										padding: "3px 8px",
										borderRadius: 6,
										border: "1px solid var(--cline-border, rgba(255,255,255,0.1))",
										background: "transparent",
										color: "var(--cline-text-muted)",
										cursor: "default",
									}}
								>
									Pythia 체크중…
								</button>
							) : (
								<button
									type="button"
									onClick={() => handleFactCheck(e)}
									style={{
										marginTop: 6,
										fontSize: 11,
										padding: "3px 8px",
										borderRadius: 6,
										border: "1px solid rgba(56,189,248,0.4)",
										background: "rgba(56,189,248,0.1)",
										color: "#38bdf8",
										cursor: "pointer",
									}}
								>
									Pythia 팩트체크
								</button>
							)}
							{factCheckResult?.eventId === e.id && factCheckResult?.result && (
								<div style={{ fontSize: 10, color: "#38bdf8", marginTop: 6 }}>
									Pythia: {factCheckResult.result.summary}
								</div>
							)}
							{factCheckError && factChecking !== e.id && (
								<div style={{ fontSize: 10, color: "var(--cline-rose, #f43f5e)", marginTop: 6 }}>
									{factCheckError}
								</div>
							)}
						</div>
					))}
				</div>

				<div style={{ flex: 1, minWidth: 300 }}>
					<h3 style={{ color: "var(--cline-text)", fontSize: 14, marginBottom: 10 }}>
						{t.world.predictions}
					</h3>
					<div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
						{HORIZONS.map((h) => (
							<button
								key={h.key}
								type="button"
								onClick={() => setHorizon(h.key)}
								style={{
									fontSize: 12,
									padding: "4px 10px",
									borderRadius: 999,
									border:
										horizon === h.key
											? "1px solid #38bdf8"
											: "1px solid var(--cline-border, rgba(255,255,255,0.1))",
									background: horizon === h.key ? "rgba(56,189,248,0.15)" : "transparent",
									color: horizon === h.key ? "#38bdf8" : "var(--cline-text-muted)",
									cursor: "pointer",
								}}
							>
								{h.label}
							</button>
						))}
					</div>
					{predictions.length === 0 && (
						<p style={{ color: "var(--cline-text-muted)", fontSize: 13 }}>
							{t.world.noPredictions}
						</p>
					)}
					{predictions.map((p) => (
						<div
							key={p.id}
							style={{
								padding: "10px 14px",
								background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))",
								borderRadius: 8,
								marginBottom: 8,
								borderLeft: `3px solid ${probabilityColor(p.probability)}`,
							}}
						>
							<div style={{ fontSize: 13, color: "var(--cline-text)" }}>{p.title}</div>
							<div
								style={{
									fontSize: 11,
									color: "var(--cline-text-muted)",
									marginTop: 4,
									display: "flex",
									gap: 10,
								}}
							>
								<span>{t.world.probability(Math.round(p.probability * 100))}</span>
								<span>{t.world.confidence(Math.round(p.confidence * 100))}</span>
							</div>
							<div style={{ fontSize: 11, color: "var(--cline-text-muted)", marginTop: 4 }}>
								{p.rationale}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};

export default WorldPage;
