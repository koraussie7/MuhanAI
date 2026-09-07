/**
 * BrowserProfilePanel — AIHawk-compatible browser profile settings.
 *
 * Mirrors MuhanSettingsPanel's shape: a stub adapter, a React surface,
 * and an opt-in `adapter` prop for production wiring.
 *
 * Surfaces:
 *   1. Browser identity (seed → fingerprint hash → preferred proxy)
 *   2. Active browser profiles (label, seed, last used, location)
 *   3. Profile actions: rotate seed, change proxy, delete profile
 *
 * Mirrors AIHawk ADR-4: profile pins seed + identity, NOT the proxy
 * (timezone/locale/geography follow the proxy exit). The UI reflects
 * this — `proxy` is shown but framed as a *binding*, not a *part*.
 *
 * Phase 1 ships this UI shell; Phase 2 wires the real adapter to the
 * muhan-agent daemon's `browser` capability surface.
 */

import { Eye, Fingerprint, Globe, MapPin, PowerOff, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

interface BrowserProfile {
	/** Opaque identifier; same value as the SEED used to derive the fingerprint. */
	seed: number;
	/** Human label; surfaced in `/muhanai` join flows. */
	label: string;
	/** SHA-ish fingerprint hash; first 12 chars only, never the raw seed. */
	fingerprintPreview: string;
	/** Currently-bound proxy exit; null = direct. */
	proxy: string | null;
	/** ms since epoch. */
	lastUsed: number;
	/** ms since epoch; undefined = never. */
	revokedAt?: number;
}

interface BrowserProfileSettings {
	listProfiles(): Promise<BrowserProfile[]>;
	rotateSeed(seed: number): Promise<BrowserProfile>;
	rebindProxy(seed: number, proxy: string | null): Promise<void>;
	revokeProfile(seed: number): Promise<void>;
}

function stubAdapter(): BrowserProfileSettings {
	const now = Date.now();
	return {
		async listProfiles() {
			return [
				{
					seed: 1729,
					label: "Default (US-West)",
					fingerprintPreview: "1d3a8c7e6b2f",
					proxy: null,
					lastUsed: now - 90_000,
				},
				{
					seed: 7777,
					label: "EU Investigations",
					fingerprintPreview: "9b41f02a6e7c",
					proxy: "socks5://proxy.example.com:1080",
					lastUsed: now - 2 * 3_600_000,
				},
				{
					seed: 4242,
					label: "Revoked 2026-08-30",
					fingerprintPreview: "44c10eaf0192",
					proxy: null,
					lastUsed: now - 7 * 86_400_000,
					revokedAt: now - 7 * 86_400_000,
				},
			];
		},
		async rotateSeed(seed) {
			const next = Math.floor(Math.random() * 0xffffff);
			console.warn(`[stub] rotateSeed(${seed}) → ${next}`);
			return {
				seed: next,
				label: "Rotated",
				fingerprintPreview: next.toString(16).padStart(8, "0").slice(0, 12),
				proxy: null,
				lastUsed: Date.now(),
			};
		},
		async rebindProxy(seed, proxy) {
			console.warn(`[stub] rebindProxy(${seed}, ${proxy ?? "direct"})`);
		},
		async revokeProfile(seed) {
			console.warn(`[stub] revokeProfile(${seed})`);
		},
	};
}

export interface BrowserProfilePanelProps {
	adapter?: BrowserProfileSettings;
}

export function BrowserProfilePanel({ adapter }: BrowserProfilePanelProps = {}) {
	const adp = adapter ?? stubAdapter();
	const [profiles, setProfiles] = useState<BrowserProfile[]>([]);
	const [busy, setBusy] = useState(false);

	const refresh = async () => {
		setBusy(true);
		try {
			setProfiles(await adp.listProfiles());
		} finally {
			setBusy(false);
		}
	};

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const rotate = async (seed: number) => {
		if (!confirm(`Rotate seed for profile ${seed}? Browser identity will change.`)) return;
		setBusy(true);
		try {
			await adp.rotateSeed(seed);
			await refresh();
		} finally {
			setBusy(false);
		}
	};

	const revoke = async (seed: number) => {
		if (!confirm(`Revoke browser profile ${seed}? Active sessions will be killed.`)) return;
		setBusy(true);
		try {
			await adp.revokeProfile(seed);
			await refresh();
		} finally {
			setBusy(false);
		}
	};

	return (
		<section className="browser-profile-panel" style={{ display: "grid", gap: 16, padding: 16 }}>
			<header style={{ display: "flex", alignItems: "center", gap: 12 }}>
				<Globe size={20} />
				<h2 style={{ margin: 0, fontSize: 18 }}>Browser Profiles</h2>
				<span className="protocol-badge proto-libp2p">AIHawk-compatible</span>
				<button
					type="button"
					onClick={refresh}
					disabled={busy}
					style={{
						marginLeft: "auto",
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
					}}
				>
					<RefreshCw size={14} /> {busy ? "Refreshing…" : "Refresh"}
				</button>
			</header>

			<p style={{ color: "#8f9188", fontSize: 13, margin: 0 }}>
				Profiles pin a <strong>seed</strong> (browser identity). Timezone, locale and geography come
				from the <strong>proxy exit</strong>, not the profile — change the proxy to change the
				apparent location.
			</p>

			<table style={{ width: "100%", borderCollapse: "collapse" }}>
				<thead>
					<tr>
						<th align="left">Label</th>
						<th align="left">Seed</th>
						<th align="left">Fingerprint</th>
						<th align="left">Exit</th>
						<th align="left">Last used</th>
						<th align="right">Actions</th>
					</tr>
				</thead>
				<tbody>
					{profiles.map((p) => {
						const isRevoked = !!p.revokedAt;
						return (
							<tr
								key={p.seed}
								style={{
									borderTop: "1px solid var(--cline-border)",
									opacity: isRevoked ? 0.55 : 1,
								}}
							>
								<td>
									<span
										style={{
											display: "inline-flex",
											alignItems: "center",
											gap: 6,
										}}
									>
										<Eye size={14} /> {p.label}
									</span>
								</td>
								<td>
									<code style={{ fontSize: 12 }}>{p.seed}</code>
								</td>
								<td>
									<span
										style={{
											display: "inline-flex",
											alignItems: "center",
											gap: 6,
											fontSize: 12,
										}}
									>
										<Fingerprint size={14} /> <code>{p.fingerprintPreview}</code>
									</span>
								</td>
								<td>
									{p.proxy ? (
										<span
											style={{
												display: "inline-flex",
												alignItems: "center",
												gap: 6,
												fontSize: 12,
											}}
										>
											<MapPin size={14} /> <code>{p.proxy}</code>
										</span>
									) : (
										<span style={{ fontSize: 12, color: "#94a3b8" }}>direct</span>
									)}
								</td>
								<td>{humanAgo(p.lastUsed)}</td>
								<td
									align="right"
									style={{
										display: "flex",
										gap: 6,
										justifyContent: "flex-end",
									}}
								>
									{!isRevoked && (
										<>
											<button type="button" onClick={() => rotate(p.seed)} disabled={busy}>
												<RefreshCw size={14} /> Rotate
											</button>
											<button
												type="button"
												onClick={() => revoke(p.seed)}
												disabled={busy}
												style={{ color: "#ef4444" }}
											>
												<PowerOff size={14} /> Revoke
											</button>
										</>
									)}
									{isRevoked && (
										<button type="button" disabled style={{ color: "#94a3b8" }}>
											<Trash2 size={14} /> revoked
										</button>
									)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</section>
	);
}

function humanAgo(ms: number): string {
	const diff = Date.now() - ms;
	if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
	if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
	if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
	return `${Math.round(diff / 86_400_000)}d ago`;
}
