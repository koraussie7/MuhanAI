/**
 * Thin Client dashboard — device fleet, BYOK inventory, approvals, audit.
 *
 * Read model mirrors `services/api/src/thin-client-routes.ts` exactly:
 *   GET  /api/thin-client/config           (public)   → Config
 *   GET  /api/thin-client/approvals       (admin)    → { approvals }
 *   POST /api/thin-client/approvals/:id/decision    (admin) → { ok, status }
 *   GET  /api/thin-client/approvals/audit (admin)    → { entries }
 *   GET  /api/thin-client/updates?platform=        (public) → UpdateInfo
 *
 * Auth note: admin endpoints require `x-api-key` (server compares against
 * API_KEY with timingSafeEqual). The web app has no ambient session, so the
 * key is entered by the operator and kept in component state only — never
 * persisted, never sent anywhere but this origin.
 */

import {
	Activity,
	AlertTriangle,
	CheckCircle2,
	Download,
	KeyRound,
	Monitor,
	RefreshCw,
	Shield,
	Smartphone,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

type Tab = "config" | "approvals" | "audit";

interface Config {
	latestVersion: string;
	minimumVersion: string;
	updateChannel: string;
	releaseNotes: string;
	downloadBaseUrl: string;
	keylessProviders: string[];
	byokProviders: string[];
}

interface Approval {
	id: string;
	resource: string;
	riskTier: "read" | "write" | "external" | "system";
	summary: string;
	args?: Record<string, string | number | boolean | null>;
	deviceId?: string;
	traceId?: string;
	status: "pending" | "approved" | "denied" | "expired";
	createdAt: number;
	expiresAt: number;
	decidedAt?: number;
	decidedBy?: string;
	reason?: string;
}

interface AuditEntry {
	id: string;
	at: number;
	action: string;
	actor: string;
	detail?: Record<string, unknown>;
}

interface UpdateInfo {
	version: string;
	minVersion: string;
	channel: string;
	releaseNotes: string;
	hasUpdate: boolean;
	downloadUrl: string;
	fileName: string;
}

const RISK_ORDER: Record<Approval["riskTier"], number> = {
	read: 0,
	write: 1,
	external: 2,
	system: 3,
};

async function readError(res: Response): Promise<string> {
	try {
		const body = (await res.json()) as { error?: unknown };
		if (typeof body.error === "string") return body.error;
	} catch {
		// non-JSON error body
	}
	return `HTTP ${res.status}`;
}

const TABS: Array<{ id: Tab; label: string }> = [
	{ id: "config", label: "Config" },
	{ id: "approvals", label: "Approvals" },
	{ id: "audit", label: "Audit" },
];

const at = (ms?: number) => (ms ? new Date(ms).toLocaleString() : "—");
const API = import.meta.env.VITE_API_BASE ?? "";

const RISK_STYLE: Record<Approval["riskTier"], { color: string; icon: React.ReactNode }> = {
	read: { color: "#38bdf8", icon: <Activity size={13} /> },
	write: { color: "#fbbf24", icon: <AlertTriangle size={13} /> },
	external: { color: "#fb923c", icon: <Shield size={13} /> },
	system: { color: "#f87171", icon: <AlertTriangle size={13} /> },
};

const PLATFORMS = [
	{ id: "darwin", label: "macOS" },
	{ id: "win32", label: "Windows" },
	{ id: "linux", label: "Linux" },
] as const;

type PlatformId = (typeof PLATFORMS)[number]["id"];

export function ThinClientPage() {
	const [tab, setTab] = useState<Tab>("config");
	const [apiKey, setApiKey] = useState("");
	const [config, setConfig] = useState<Config | null>(null);
	const [update, setUpdate] = useState<UpdateInfo | null>(null);
	const [platform, setPlatform] = useState<PlatformId>("darwin");
	const [approvals, setApprovals] = useState<Approval[]>([]);
	const [audit, setAudit] = useState<AuditEntry[]>([]);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [loading, setLoading] = useState(true);
	const [nonce, setNonce] = useState(0);
	const reasonRef = useRef<HTMLTextAreaElement>(null);

	/** Public endpoints need no credentials; admin ones need the operator's key. */
	const authedFetch = useCallback(
		async <T,>(path: string, init?: RequestInit): Promise<T> => {
			const res = await fetch(`${API}${path}`, {
				...init,
				headers: {
					"content-type": "application/json",
					...(apiKey ? { "x-api-key": apiKey } : {}),
					...(init?.headers ?? {}),
				},
			});
			if (!res.ok) throw new Error(await readError(res));
			return (await res.json()) as T;
		},
		[apiKey],
	);

	// Public config + update feed — always safe to call without credentials.
	useEffect(() => {
		const controller = new AbortController();
		(async () => {
			setLoading(true);
			try {
				const [cfg, upd] = await Promise.all([
					fetch(`${API}/api/thin-client/config`, { signal: controller.signal })
						.then((r) => (r.ok ? r.json() : null))
						.catch(() => null),
					fetch(`${API}/api/thin-client/updates?platform=${platform}`, {
						signal: controller.signal,
					})
						.then((r) => (r.ok ? r.json() : null))
						.catch(() => null),
				]);
				setConfig(cfg);
				setUpdate(upd);
				setError(cfg ? "" : "Failed to reach the API server.");
			} finally {
				setLoading(false);
			}
		})();
		return () => controller.abort();
	}, [platform, nonce]);

	// Admin data — only after the operator supplies a key, and never on a timer,
	// so a bad key cannot turn into a polling loop.
	useEffect(() => {
		if (!apiKey) return;
		if (tab !== "approvals" && tab !== "audit") return;
		let cancelled = false;
		(async () => {
			try {
				if (tab === "approvals") {
					const res = await authedFetch<{ approvals: Approval[] }>("/api/thin-client/approvals");
					if (!cancelled) {
						setApprovals(res.approvals);
						setError("");
					}
				} else {
					const res = await authedFetch<{ entries: AuditEntry[] }>(
						"/api/thin-client/approvals/audit",
					);
					if (!cancelled) {
						setAudit([...res.entries].reverse());
						setError("");
					}
				}
			} catch (err) {
				if (!cancelled) setError(err instanceof Error ? err.message : "Request failed");
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [apiKey, tab, authedFetch, nonce]);

	const decide = async (id: string, decision: "approve" | "deny") => {
		setBusy(true);
		try {
			await authedFetch(`/api/thin-client/approvals/${id}/decision`, {
				method: "POST",
				body: JSON.stringify({ decision, reason: reasonRef.current?.value || undefined }),
			});
			setApprovals((prev) => prev.filter((a) => a.id !== id));
			setError("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Decision failed");
		} finally {
			setBusy(false);
		}
	};
	return (
		<div className="cline-chat-container">
			<div className="dashboard-hero-card" style={{ padding: "20px 24px" }}>
				<div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
					<Monitor size={28} style={{ color: "#38bdf8" }} />
					<div>
						<h1 className="dashboard-hero-title" style={{ fontSize: 20 }}>
							Thin Client
						</h1>
						<p className="dashboard-hero-desc">
							Electron 데스크톱 + Capacitor 안드로이드 보낸 앱의 배포·페어링·승인 게이트.
						</p>
					</div>
					<button
						type="button"
						className="model-pill"
						style={{ marginLeft: "auto" }}
						onClick={() => setNonce((n) => n + 1)}
						disabled={loading}
					>
						<RefreshCw size={12} /> Refresh
					</button>
				</div>
			</div>

			<div className="prompt-console-card" style={{ marginTop: 16, padding: 12 }}>
				<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
					{TABS.map((t) => (
						<button
							key={t.id}
							type="button"
							className={`model-pill ${tab === t.id ? "active" : ""}`}
							onClick={() => setTab(t.id)}
						>
							{t.label}
						</button>
					))}
				</div>
			</div>

			{error && (
				<div
					style={{
						marginTop: 12,
						padding: "10px 14px",
						borderRadius: 6,
						background: "rgba(248,113,113,0.12)",
						border: "1px solid rgba(248,113,113,0.35)",
						color: "#fca5a5",
						fontSize: 13,
					}}
				>
					{error}
				</div>
			)}

			{tab === "config" && (
				<div className="prompt-console-card" style={{ marginTop: 16 }}>
					<div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
						{PLATFORMS.map((p) => (
							<button
								key={p.id}
								type="button"
								className={`model-pill ${platform === p.id ? "active" : ""}`}
								onClick={() => setPlatform(p.id)}
							>
								<Download size={12} /> {p.label}
							</button>
						))}
					</div>

					{!config && !loading && <p style={{ color: "var(--cline-text-muted)" }}>No config.</p>}

					{config && (
						<div style={{ display: "grid", gap: 10 }}>
							<Row label="Latest version" value={config.latestVersion} />
							<Row label="Minimum version" value={config.minimumVersion} />
							<Row label="Update channel" value={config.updateChannel} />
							<Row label="Download base" value={config.downloadBaseUrl} />
							<Row label="Keyless providers" value={config.keylessProviders.join(", ") || "—"} />
							<Row label="BYOK providers" value={config.byokProviders.join(", ") || "—"} />
							{config.releaseNotes && (
								<div>
									<span style={{ fontSize: 11, color: "var(--cline-text-muted)" }}>
										RELEASE NOTES
									</span>
									<p style={{ fontSize: 13, marginTop: 4 }}>{config.releaseNotes}</p>
								</div>
							)}
						</div>
					)}

					{update && (
						<div
							style={{
								marginTop: 16,
								paddingTop: 14,
								borderTop: "1px solid var(--cline-border)",
							}}
						>
							<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
								{update.hasUpdate ? (
									<span style={{ color: "#fbbf24", fontSize: 13, fontWeight: 600 }}>
										Update available → {update.version}
									</span>
								) : (
									<span style={{ color: "#4ade80", fontSize: 13, fontWeight: 600 }}>
										<CheckCircle2 size={13} /> Up to date
									</span>
								)}
							</div>
							<p style={{ fontSize: 12, color: "var(--cline-text-muted)", marginTop: 6 }}>
								{update.fileName} · {update.downloadUrl}
							</p>
						</div>
					)}
				</div>
			)}
			{tab !== "config" && (
				<div className="prompt-console-card" style={{ marginTop: 16, padding: 12 }}>
					<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
						<KeyRound size={13} style={{ color: "#a78bfa" }} />
						<input
							type="password"
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							placeholder="Admin API key (x-api-key) — kept in memory only"
							style={{
								flex: 1,
								minWidth: 220,
								padding: "6px 10px",
								fontSize: 13,
								borderRadius: 6,
								border: "1px solid var(--cline-border)",
								background: "var(--cline-input-background, transparent)",
								color: "inherit",
							}}
						/>
						<button
							type="button"
							className="model-pill"
							onClick={() => setNonce((n) => n + 1)}
							disabled={!apiKey || loading}
						>
							Load
						</button>
					</div>
					{!apiKey && (
						<p style={{ fontSize: 11, color: "var(--cline-text-muted)", marginTop: 8 }}>
							Approval decisions are privileged. Enter the operator key to load this tab.
						</p>
					)}
				</div>
			)}

			{tab === "approvals" && (
				<div className="prompt-console-card" style={{ marginTop: 16 }}>
					{apiKey && approvals.length === 0 && !error && (
						<p style={{ color: "var(--cline-text-muted)", fontSize: 13 }}>No pending approvals.</p>
					)}
					<div style={{ display: "grid", gap: 12 }}>
						{[...approvals]
							.sort((a, b) => RISK_ORDER[b.riskTier] - RISK_ORDER[a.riskTier])
							.map((a) => {
								const risk = RISK_STYLE[a.riskTier];
								return (
									<div
										key={a.id}
										style={{
											border: "1px solid var(--cline-border)",
											borderRadius: 8,
											padding: 12,
											display: "grid",
											gap: 8,
										}}
									>
										<div
											style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
										>
											<span style={{ color: risk.color, display: "flex", alignItems: "center" }}>
												{risk.icon}
											</span>
											<code style={{ fontSize: 12 }}>{a.resource}</code>
											<span style={{ fontSize: 11, color: risk.color, textTransform: "uppercase" }}>
												{a.riskTier}
											</span>
											<span
												style={{
													marginLeft: "auto",
													fontSize: 11,
													color: "var(--cline-text-muted)",
												}}
											>
												expires {at(a.expiresAt)}
											</span>
										</div>
										<p style={{ fontSize: 13, margin: 0 }}>{a.summary}</p>
										{a.args && Object.keys(a.args).length > 0 && (
											<pre
												style={{
													margin: 0,
													padding: 8,
													fontSize: 11,
													background: "rgba(127,127,127,0.08)",
													borderRadius: 6,
													overflowX: "auto",
												}}
											>
												{JSON.stringify(a.args, null, 2)}
											</pre>
										)}
										{(a.deviceId || a.traceId) && (
											<div style={{ fontSize: 11, color: "var(--cline-text-muted)" }}>
												{a.deviceId ? `device ${a.deviceId}` : ""}
												{a.deviceId && a.traceId ? " · " : ""}
												{a.traceId ? `trace ${a.traceId}` : ""}
											</div>
										)}
										<textarea
											ref={reasonRef}
											placeholder="Optional reason, recorded in the audit log"
											rows={2}
											style={{
												fontSize: 12,
												padding: 8,
												borderRadius: 6,
												border: "1px solid var(--cline-border)",
												background: "transparent",
												color: "inherit",
												resize: "vertical",
											}}
										/>
										<div style={{ display: "flex", gap: 8 }}>
											<button
												type="button"
												className="model-pill"
												disabled={busy}
												onClick={() => decide(a.id, "approve")}
											>
												<CheckCircle2 size={12} /> Approve
											</button>
											<button
												type="button"
												className="model-pill"
												disabled={busy}
												onClick={() => decide(a.id, "deny")}
											>
												Deny
											</button>
										</div>
									</div>
								);
							})}
					</div>
				</div>
			)}

			{tab === "audit" && (
				<div className="prompt-console-card" style={{ marginTop: 16 }}>
					{apiKey && audit.length === 0 && !error && (
						<p style={{ color: "var(--cline-text-muted)", fontSize: 13 }}>No audit entries.</p>
					)}
					<div style={{ display: "grid", gap: 8 }}>
						{audit.map((e) => (
							<div
								key={e.id}
								style={{
									display: "flex",
									gap: 10,
									alignItems: "baseline",
									flexWrap: "wrap",
									paddingBottom: 8,
									borderBottom: "1px solid var(--cline-border)",
									fontSize: 12,
								}}
							>
								<span style={{ color: "var(--cline-text-muted)", minWidth: 160 }}>{at(e.at)}</span>
								<code style={{ minWidth: 120 }}>{e.action}</code>
								<span style={{ color: "#a78bfa" }}>{e.actor}</span>
								{e.detail && (
									<pre
										style={{
											margin: 0,
											flexBasis: "100%",
											fontSize: 11,
											whiteSpace: "pre-wrap",
											color: "var(--cline-text-muted)",
										}}
									>
										{JSON.stringify(e.detail)}
									</pre>
								)}
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
	function Row({ label, value }: { label: string; value: string | number | undefined | null }) {
		return (
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					gap: 12,
					padding: "6px 0",
					borderBottom: "1px solid var(--cline-border)",
				}}
			>
				<span style={{ color: "var(--cline-text-muted)", fontSize: 12 }}>{label}</span>
				<span style={{ fontSize: 12, textAlign: "right", wordBreak: "break-all" }}>
					{value === undefined || value === null || value === "" ? "—" : value}
				</span>
			</div>
		);
	}
}
