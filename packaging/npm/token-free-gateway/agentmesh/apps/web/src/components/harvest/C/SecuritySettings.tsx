import { useEffect, useState } from "react";
import type { GatewayProvider } from "./GatewayPanel.js";
import { ApiVault } from "./GatewayPanel.js";

/**
 * SecuritySettings — TASK-C tkngate zero-trust gateway control plane.
 *
 * Three sub-panels:
 *   1. Zero-Trust Gateway (provider list + toggles + relay encryption)
 *   2. Budget Guard (daily cap + per-provider quota via ApiVault)
 *   3. API Vault (encrypted key inventory)
 *
 * All data is fetched through a `SecurityAdapter` so the UI can develop
 * against a stub and swap to a real adapter (`/api/security` + `/api/credits`)
 * The shape stays stable.
 */

export interface SecurityToggles {
	zeroTrustEnabled: boolean;
	relayEncryption: boolean;
	budgetGuardEnabled: boolean;
	apiVaultEnabled: boolean;
}

export interface VaultKeyEntry {
	service: string;
	label: string;
	masked: string;
	updatedAt: number;
	rotatedDays: number;
}

export interface SecurityAuditEvent {
	id: string;
	at: number;
	actor: string;
	action: string;
	detail: string;
}

export interface SecuritySnapshot {
	toggles: SecurityToggles;
	dailyLimitCredits: number;
	dailyUsedCredits: number;
	quota: { name: string; quota: number; used: number }[];
	gateways: GatewayProvider[];
	keys: VaultKeyEntry[];
	audit: SecurityAuditEvent[];
}

export interface SecurityAdapter {
	loadSnapshot(): Promise<SecuritySnapshot>;
	saveToggles(toggles: SecurityToggles): Promise<void>;
	saveDailyLimit(limit: number): Promise<void>;
	revokeKey(service: string): Promise<void>;
}

function stubSnapshot(): SecuritySnapshot {
	return {
		toggles: {
			zeroTrustEnabled: true,
			relayEncryption: true,
			budgetGuardEnabled: true,
			apiVaultEnabled: false,
		},
		dailyLimitCredits: 5000,
		dailyUsedCredits: 1416,
		quota: [
			{ name: "openai", quota: 1000, used: 412 },
			{ name: "anthropic", quota: 500, used: 188 },
			{ name: "gemini", quota: 1500, used: 720 },
			{ name: "groq", quota: 800, used: 96 },
		],
		gateways: [
			{ name: "WebLLM", status: "healthy", latencyMs: 60, costTier: "free" },
			{ name: "LocalAI", status: "healthy", latencyMs: 90, costTier: "free" },
			{ name: "Ollama", status: "healthy", latencyMs: 110, costTier: "free" },
			{ name: "FreeLLMAPI", status: "healthy", latencyMs: 210, costTier: "free" },
			{ name: "Groq", status: "healthy", latencyMs: 150, costTier: "low" },
			{ name: "Mistral", status: "degraded", latencyMs: 420, costTier: "low" },
			{ name: "Gemini", status: "healthy", latencyMs: 180, costTier: "low" },
			{ name: "Claude", status: "healthy", latencyMs: 220, costTier: "paid" },
			{ name: "GPT", status: "healthy", latencyMs: 240, costTier: "paid" },
			{ name: "OpenRouter", status: "healthy", latencyMs: 360, costTier: "paid" },
		],
		keys: [
			{
				service: "openai",
				label: "OpenAI Production",
				masked: "sk-prod-****3a9f",
				updatedAt: Date.now() - 86_400_000,
				rotatedDays: 12,
			},
			{
				service: "anthropic",
				label: "Anthropic Main",
				masked: "sk-ant-****7c2e",
				updatedAt: Date.now() - 2 * 86_400_000,
				rotatedDays: 24,
			},
			{
				service: "groq",
				label: "Groq Backup",
				masked: "gsk-****b81d",
				updatedAt: Date.now() - 5 * 86_400_000,
				rotatedDays: 45,
			},
		],
		audit: [
			{
				id: "evt-1",
				at: Date.now() - 180_000,
				actor: "user:brianyeon",
				action: "policy.change",
				detail: "Active policy → Balanced",
			},
			{
				id: "evt-2",
				at: Date.now() - 1_800_000,
				actor: "gateway:webllm",
				action: "vault.read",
				detail: "Served 3 prompts (free tier)",
			},
			{
				id: "evt-3",
				at: Date.now() - 7_200_000,
				actor: "user:brianyeon",
				action: "key.rotate",
				detail: "groq → rotated",
			},
		],
	};
}

/**
 * HTTP-backed SecurityAdapter. Talks to:
 *   GET    /api/security
 *   POST   /api/security/toggles
 *   POST   /api/security/daily-limit
 *   POST   /api/security/keys/:service/revoke
 *
 * On the read path, a network failure falls back to `stubSnapshot()` so
 * the page is always renderable. Mutations throw — the caller is expected
 * to surface the error to the user and revert optimistic state.
 */
export function createHttpSecurityAdapter(): SecurityAdapter {
	async function postJson<T>(url: string, body: T): Promise<void> {
		const res = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!res.ok) {
			throw new Error(`[security] ${url} -> ${res.status} ${res.statusText ?? ""}`.trim());
		}
	}
	return {
		async loadSnapshot() {
			const res = await fetch("/api/security", {
				headers: { Accept: "application/json" },
			});
			if (!res.ok) {
				throw new Error(`[security] /api/security -> ${res.status} ${res.statusText ?? ""}`.trim());
			}
			return (await res.json()) as SecuritySnapshot;
		},
		saveToggles(next) {
			return postJson("/api/security/toggles", next);
		},
		saveDailyLimit(limit) {
			return postJson("/api/security/daily-limit", { limit });
		},
		revokeKey(service) {
			return postJson(`/api/security/keys/${encodeURIComponent(service)}/revoke`, {});
		},
	};
}

function defaultSecurityAdapter(): SecurityAdapter {
	const live = createHttpSecurityAdapter();
	return {
		async loadSnapshot() {
			try {
				return await live.loadSnapshot();
			} catch {
				return stubSnapshot();
			}
		},
		async saveToggles(next) {
			return live.saveToggles(next);
		},
		async saveDailyLimit(limit) {
			return live.saveDailyLimit(limit);
		},
		async revokeKey(service) {
			return live.revokeKey(service);
		},
	};
}

export interface SecuritySettingsProps {
	/** Inject a real adapter; default = resilient HTTP→stub. */
	adapter?: SecurityAdapter;
}

export function SecuritySettings({ adapter }: SecuritySettingsProps = {}) {
	const adp = adapter ?? defaultSecurityAdapter();
	const [snap, setSnap] = useState<SecuritySnapshot | null>(null);
	const [busy, setBusy] = useState(false);

	const refresh = async () => {
		setBusy(true);
		try {
			setSnap(await adp.loadSnapshot());
		} finally {
			setBusy(false);
		}
	};

	useEffect(() => {
		void refresh();
	}, []);

	if (!snap) {
		return (
			<div className="hc-settings">
				<section className="hc-settings-section">
					<p style={{ color: "#8a8b80", fontSize: 12 }}>불러오는 중…</p>
				</section>
			</div>
		);
	}

	const t = snap.toggles;
	const usedPct =
		snap.dailyLimitCredits > 0
			? Math.round((snap.dailyUsedCredits / snap.dailyLimitCredits) * 100)
			: 0;

	const toggle =
		<K extends keyof SecurityToggles>(key: K) =>
		async () => {
			const next: SecurityToggles = { ...t, [key]: !t[key] };
			setSnap({ ...snap, toggles: next });
			setBusy(true);
			try {
				await adp.saveToggles(next);
			} finally {
				setBusy(false);
			}
		};

	const onLimitChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const v = Number(e.target.value);
		if (!Number.isFinite(v) || v <= 0) return;
		setSnap({ ...snap, dailyLimitCredits: v });
		setBusy(true);
		try {
			await adp.saveDailyLimit(v);
		} finally {
			setBusy(false);
		}
	};

	const onRevoke = async (service: string) => {
		if (!confirm(`Revoke ${service} API key from vault?`)) return;
		setBusy(true);
		try {
			await adp.revokeKey(service);
			await refresh();
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="hc-settings">
			{/* ---- Security status hero ---- */}
			<section className="hc-settings-section">
				<h3>Security Posture</h3>
				<div className="hc-llm-stat">
					<div className="hc-llm-stat-item">
						<span className="hc-llm-stat-label">Zero-Trust</span>
						<span className={`hc-llm-stat-value ${t.zeroTrustEnabled ? "" : "muted"}`}>
							{t.zeroTrustEnabled ? "Active" : "Off"}
						</span>
					</div>
					<div className="hc-llm-stat-item">
						<span className="hc-llm-stat-label">Relay Encryption</span>
						<span className={`hc-llm-stat-value ${t.relayEncryption ? "" : "muted"}`}>
							{t.relayEncryption ? "E2E" : "Disabled"}
						</span>
					</div>
					<div className="hc-llm-stat-item">
						<span className="hc-llm-stat-label">Budget</span>
						<span className="hc-llm-stat-value">
							{snap.dailyUsedCredits.toLocaleString("ko-KR")} /{" "}
							{snap.dailyLimitCredits.toLocaleString("ko-KR")} ({usedPct}%)
						</span>
					</div>
					<div className="hc-llm-stat-item">
						<span className="hc-llm-stat-label">Vault</span>
						<span className="hc-llm-stat-value">
							{snap.keys.length} keys · {t.apiVaultEnabled ? "Encrypted" : "Disabled"}
						</span>
					</div>
				</div>
			</section>

			{/* ---- Zero Trust toggles ---- */}
			<section className="hc-settings-section">
				<h3>Zero-Trust Gateway</h3>
				<div className="hc-toggle-row">
					<div>
						<strong>게이트웨이 활성화</strong>
						<p>모든 LLM 호출을 정책 체인을 통과시킵니다.</p>
					</div>
					<button
						type="button"
						className={`hc-toggle ${t.zeroTrustEnabled ? "on" : ""}`}
						onClick={toggle("zeroTrustEnabled")}
						disabled={busy}
						aria-pressed={t.zeroTrustEnabled}
					>
						<span className="hc-toggle-knob" />
					</button>
				</div>
				<div className="hc-toggle-row">
					<div>
						<strong>릴레이 암호화</strong>
						<p>피어 간 메시지를 E2E 암호화합니다.</p>
					</div>
					<button
						type="button"
						className={`hc-toggle ${t.relayEncryption ? "on" : ""}`}
						onClick={toggle("relayEncryption")}
						disabled={busy}
						aria-pressed={t.relayEncryption}
					>
						<span className="hc-toggle-knob" />
					</button>
				</div>
			</section>

			{/* ---- Budget Guard ---- */}
			<section className="hc-settings-section">
				<h3>Budget Guard</h3>
				<div className="hc-toggle-row">
					<div>
						<strong>예산 가드</strong>
						<p>일일 크레딧 한도를 초과하면 유료 API를 차단합니다.</p>
					</div>
					<button
						type="button"
						className={`hc-toggle ${t.budgetGuardEnabled ? "on" : ""}`}
						onClick={toggle("budgetGuardEnabled")}
						disabled={busy}
						aria-pressed={t.budgetGuardEnabled}
					>
						<span className="hc-toggle-knob" />
					</button>
				</div>
				<div className="hc-settings-field">
					<label htmlFor="hc-daily-limit">일일 한도 (cr)</label>
					<input
						id="hc-daily-limit"
						type="number"
						value={snap.dailyLimitCredits}
						onChange={onLimitChange}
						disabled={busy}
						className="hc-settings-input"
					/>
					<div className="hc-load-bar" style={{ flex: 1 }}>
						<div
							className={`hc-load-bar-fill ${usedPct > 85 ? "hot" : usedPct > 60 ? "warm" : "cool"}`}
							style={{ width: `${usedPct}%` }}
						/>
					</div>
				</div>
			</section>

			{/* ---- API Vault quota (per-provider) ---- */}
			<ApiVault entries={snap.quota} />

			{/* ---- Key inventory ---- */}
			<section className="hc-settings-section">
				<h3>API Vault</h3>
				<div className="hc-toggle-row">
					<div>
						<strong>키 보관소</strong>
						<p>API 키를 암호화하여 로컬에 저장합니다.</p>
					</div>
					<button
						type="button"
						className={`hc-toggle ${t.apiVaultEnabled ? "on" : ""}`}
						onClick={toggle("apiVaultEnabled")}
						disabled={busy}
						aria-pressed={t.apiVaultEnabled}
					>
						<span className="hc-toggle-knob" />
					</button>
				</div>
				<ul className="hc-vault-keys">
					{snap.keys.map((k) => {
						const stale = k.rotatedDays > 30;
						return (
							<li key={k.service} className="hc-vault-key">
								<span className="hc-vault-name">{k.label}</span>
								<span className="hc-vault-sk">{k.masked}</span>
								<span
									style={{
										fontSize: 10,
										color: stale ? "#ffb86b" : "#7ee787",
										textTransform: "uppercase",
										letterSpacing: "0.06em",
									}}
									title={stale ? "30일 회전 권장" : "신선"}
								>
									{stale ? "rotate soon" : "fresh"} · {k.rotatedDays}d
								</span>
								<button
									type="button"
									className="hc-vault-revoke"
									onClick={() => onRevoke(k.service)}
									disabled={busy}
								>
									폐기
								</button>
							</li>
						);
					})}
				</ul>
			</section>

			{/* ---- Audit log ---- */}
			<section className="hc-settings-section">
				<h3>Recent Activity</h3>
				<ul className="hc-ledger-log">
					{snap.audit.map((e) => (
						<li key={e.id}>
							<span className="hc-ledger-log-reason">
								<strong style={{ color: "#e6ff87" }}>{e.action}</strong> · {e.actor}
							</span>
							<span className="hc-ledger-log-at">{humanAgo(e.at)}</span>
							<span style={{ fontSize: 11, color: "#8a8b80", flexBasis: "100%" }}>{e.detail}</span>
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}

function humanAgo(ms: number): string {
	const diff = Date.now() - ms;
	if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
	if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
	if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
	return `${Math.round(diff / 86_400_000)}d ago`;
}

function _Page({
	title,
	subtitle,
	children,
}: {
	title: string;
	subtitle?: string;
	children: React.ReactNode;
}) {
	return (
		<section className="dash-page">
			<header className="dash-page-header">
				<h2>{title}</h2>
				{subtitle && <p className="dash-page-subtitle">{subtitle}</p>}
			</header>
			{children}
		</section>
	);
}
