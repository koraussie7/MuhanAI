/**
 * Osiris-style World Mesh Dashboard Panel.
 *
 * Combines the Pythia World Engine live globe (WorldGlobe) with the Token-Free
 * Gateway Pythia API (Python coding analysis) into a single pane:
 *  - Left: live 3D globe with event markers (from /api/world/events)
 *  - Right: Pythia session panel for submitting Python coding tasks
 *  - Bottom: cosmic graph concepts (from /api/pythia/graph/concepts)
 *
 * All data comes through muhanai.com's keyless endpoints — zero API keys, zero cost.
 */

import { Code2, Globe2, RefreshCw, Zap } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { listPythiaModels, type PythiaSessionResult, runPythiaSession } from "../lib/pythia-client";
import { fetchWorldBrief, type WorldBrief } from "../lib/world-client";
import type { WorldEvent } from "../lib/world-types";
import { WorldGlobe } from "./WorldGlobe";

interface GraphConcept {
	id: string;
	label: string;
	domain: string;
	status: string;
	signalScore: number;
	effectiveStatus: "raw" | "validated" | "amplified";
}

export const WorldMeshPanel: React.FC = () => {
	// --- World Engine state ---
	const [brief, setBrief] = useState<WorldBrief | null>(null);
	const [worldLoading, setWorldLoading] = useState(false);
	const [worldError, setWorldError] = useState<string | null>(null);

	// --- Pythia state ---
	const [models, setModels] = useState<string[]>(["auto"]);
	const [model, setModel] = useState("auto");
	const [file, setFile] = useState("app.py");
	const [prompt, setPrompt] = useState("");
	const [pyResult, setPyResult] = useState<PythiaSessionResult | null>(null);
	const [pythiaLoading, setPythiaLoading] = useState(false);
	const [pythiaError, setPythiaError] = useState<string | null>(null);

	// --- Graph state ---
	const [concepts, setConcepts] = useState<GraphConcept[]>([]);
	const [graphLoading, setGraphLoading] = useState(false);

	const load = useCallback(async () => {
		setWorldLoading(true);
		try {
			const b = await fetchWorldBrief();
			setBrief(b);
			setWorldError(null);
		} catch (e) {
			setWorldError((e as Error).message ?? "World fetch failed");
		} finally {
			setWorldLoading(false);
		}
	}, []);

	const loadModels = useCallback(async () => {
		try {
			const m = await listPythiaModels();
			setModels(m);
		} catch {
			setModels(["auto"]);
		}
	}, []);

	const loadConcepts = useCallback(async () => {
		setGraphLoading(true);
		try {
			const res = await fetch("/api/pythia/graph/concepts");
			if (res.ok) {
				const data = (await res.json()) as { concepts: GraphConcept[] };
				setConcepts(data.concepts?.slice(0, 12) ?? []);
			}
		} catch {
			// degrade silently
		} finally {
			setGraphLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
		void loadModels();
		void loadConcepts();
	}, [load, loadModels, loadConcepts]);

	const events: WorldEvent[] = brief?.events ?? [];
	const isOnline = brief?.source === "pythia";

	const handleRun = async () => {
		if (!prompt.trim()) return;
		setPythiaLoading(true);
		setPyResult(null);
		try {
			const result = await runPythiaSession({ file, prompt, model });
			setPyResult(result);
			setPythiaError(null);
			void loadConcepts();
		} catch (e: unknown) {
			setPythiaError((e as { message?: string })?.message ?? "All keyless providers failed");
		} finally {
			setPythiaLoading(false);
		}
	};

	return (
		<div className="cline-chat-container">
			<div className="dashboard-hero-card" style={{ padding: "20px 24px" }}>
				<div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
					<Globe2 size={28} style={{ color: "#38bdf8" }} />
					<div style={{ flex: 1 }}>
						<h1 className="dashboard-hero-title" style={{ fontSize: 20 }}>
							World Mesh — Pythia x Osiris
						</h1>
						<p className="dashboard-hero-desc">
							3D 세계 지구본 + 실시간 이벤트 + Pythia Python 분석. 키 없이, 비용 없이 muhanai.com
							Token-Free Gateway.
						</p>
					</div>
					<button
						type="button"
						onClick={() => {
							void load();
							void loadConcepts();
						}}
						disabled={worldLoading}
						style={{
							background: "transparent",
							border: "1px solid var(--cline-border, rgba(255,255,255,0.1))",
							borderRadius: 6,
							padding: "6px 10px",
							cursor: "pointer",
							color: "var(--cline-text)",
							display: "flex",
							alignItems: "center",
							gap: 6,
						}}
					>
						<RefreshCw size={14} className={worldLoading ? "animate-spin" : ""} />
						새로고침
					</button>
				</div>
			</div>

			<div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
				<div style={{ flex: 1, minWidth: 320, height: 360 }}>
					<WorldGlobe
						events={events}
						isOnline={isOnline}
						lastUpdated={brief?.fetchedAt}
						onRefresh={() => void load()}
					/>
				</div>

				<div style={{ flex: 1, minWidth: 320, maxWidth: 480 }}>
					<div className="prompt-console-card" style={{ padding: 16, height: "100%" }}>
						<div className="prompt-model-pills" style={{ marginBottom: 12 }}>
							<span
								style={{
									fontSize: 11,
									color: "var(--cline-text-muted)",
									fontWeight: 600,
									textTransform: "uppercase",
								}}
							>
								Target File
							</span>
							<div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
								<Code2 size={14} style={{ color: "#38bdf8" }} />
								<input
									type="text"
									value={file}
									onChange={(e) => setFile(e.target.value)}
									style={{
										background: "var(--cline-bg-tertiary, rgba(255,255,255,0.05))",
										border: "1px solid var(--cline-border, rgba(255,255,255,0.1))",
										borderRadius: 6,
										padding: "4px 8px",
										color: "var(--cline-text)",
										fontSize: 13,
										flex: 1,
									}}
									placeholder="app.py"
								/>
							</div>
						</div>

						<div className="prompt-model-pills" style={{ marginBottom: 12 }}>
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
							<div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
								<Zap size={14} style={{ color: "#38bdf8" }} />
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
									}}
								>
									{models.map((m) => (
										<option key={m} value={m}>
											{m}
										</option>
									))}
								</select>
							</div>
						</div>

						<textarea
							className="prompt-input"
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							placeholder="Python 코드 분석/수정 요청을 입력하세요..."
							rows={4}
							style={{ resize: "vertical", minHeight: 80 }}
						/>

						<div style={{ display: "flex", gap: 8, marginTop: 12 }}>
							<button
								type="button"
								className="send-btn"
								onClick={handleRun}
								disabled={pythiaLoading || !prompt.trim()}
							>
								<Zap size={14} />{" "}
								{pythiaLoading ? "Gateway Processing..." : "Run via Token-Free Gateway"}
							</button>
						</div>

						{pythiaError && (
							<div
								style={{
									marginTop: 12,
									padding: "8px 12px",
									background: "rgba(244,63,94,0.15)",
									borderRadius: 6,
									fontSize: 12,
									color: "#f43f5e",
								}}
							>
								{pythiaError}
							</div>
						)}

						{pyResult && (
							<div style={{ marginTop: 16 }}>
								<div className="result-label">
									Response ({pyResult.cost}) via {pyResult.provider}
								</div>
								<pre className="result-text">{pyResult.response}</pre>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* ── Cosmic concepts from graph ── */}
			<div style={{ marginTop: 16 }}>
				<h3 style={{ color: "var(--cline-text)", fontSize: 14, marginBottom: 10 }}>
					Cosmic Concepts ({concepts.length})
				</h3>
				{graphLoading ? (
					<p style={{ color: "var(--cline-text-muted)", fontSize: 13 }}>Loading concepts…</p>
				) : concepts.length === 0 ? (
					<p style={{ color: "var(--cline-text-muted)", fontSize: 13 }}>
						No concepts yet. Run a Pythia analysis to seed the cosmic graph.
					</p>
				) : (
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
							gap: 8,
						}}
					>
						{concepts.map((c) => (
							<div
								key={c.id}
								style={{
									padding: "8px 12px",
									background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))",
									borderRadius: 8,
									borderLeft: `3px solid ${
										c.effectiveStatus === "amplified"
											? "#10b981"
											: c.effectiveStatus === "validated"
												? "#38bdf8"
												: "#94a3b8"
									}`,
								}}
							>
								<div style={{ fontSize: 12, color: "var(--cline-text)" }}>
									{c.label}
									{"."}
									<span
										style={{
											fontSize: 10,
											color: "var(--cline-text-muted)",
											marginLeft: 4,
										}}
									>
										{c.domain}
									</span>
								</div>
								<div
									style={{
										fontSize: 10,
										color: "var(--cline-text-muted)",
										marginTop: 2,
									}}
								>
									score: {Math.round(c.signalScore)} | {c.effectiveStatus}
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{worldError && <p style={{ color: "#f59e0b", fontSize: 12, marginTop: 8 }}>{worldError}</p>}
		</div>
	);
};

export default WorldMeshPanel;
