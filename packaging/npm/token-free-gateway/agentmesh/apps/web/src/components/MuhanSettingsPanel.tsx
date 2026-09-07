/**
 * MuhanSettingsPanel — MuhanAI happy-app integration settings.
 *
 * Surfaces three control surfaces for the user:
 *   1. Registered machines (from gateway machine-claim registry)
 *   2. Active sessions
 *   3. Credentials vault (proxy to muhan-agent's local vault)
 *
 * All data is fetched from a stub adapter — wired to real gateway +
 * vault once those are deployed. The stub returns synthetic data so
 * the UI can be developed in isolation.
 *
 * Phase 1 ships this UI shell; Phase 2 wires real adapters.
 */

import { KeyRound, Monitor, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

interface RegisteredMachine {
	machineId: string;
	label: string;
	platform: "macos" | "linux" | "windows";
	online: boolean;
	lastSeen: number;
	reputation: number;
}

interface VaultEntryView {
	service: string;
	hasSecret: boolean;
	updatedAt: number;
}

interface MuhanSettings {
	listMachines(): Promise<RegisteredMachine[]>;
	revokeMachine(machineId: string): Promise<void>;
	listVault(): Promise<VaultEntryView[]>;
	removeVaultEntry(service: string): Promise<void>;
	addVaultEntry(service: string, secret: string): Promise<void>;
}

/**
 * Default stub adapter — returns synthetic data so the UI renders.
 * Replace with a real adapter that proxies to the gateway + muhan-agent
 * when those ship. The interface stays stable.
 */
function stubAdapter(): MuhanSettings {
	return {
		async listMachines() {
			return [
				{
					machineId: "machine_a1b2c3d4e5f6g7h8",
					label: "Brianyeon's MacBook Pro",
					platform: "macos",
					online: true,
					lastSeen: Date.now() - 5_000,
					reputation: 0.94,
				},
				{
					machineId: "machine_z9y8x7w6v5u4t3s2",
					label: "Office Linux Tower",
					platform: "linux",
					online: false,
					lastSeen: Date.now() - 60 * 60_000,
					reputation: 0.71,
				},
			];
		},
		async revokeMachine(machineId) {
			console.warn(`[stub] revokeMachine(${machineId})`);
		},
		async listVault() {
			return [
				{
					service: "openai",
					hasSecret: true,
					updatedAt: Date.now() - 86_400_000,
				},
				{
					service: "anthropic",
					hasSecret: true,
					updatedAt: Date.now() - 2 * 86_400_000,
				},
			];
		},
		async removeVaultEntry(service) {
			console.warn(`[stub] removeVaultEntry(${service})`);
		},
		async addVaultEntry(service, secret) {
			console.warn(`[stub] addVaultEntry(${service}, len=${secret.length})`);
		},
	};
}

export interface MuhanSettingsPanelProps {
	/** Inject a real adapter; default = stub for UI dev. */
	adapter?: MuhanSettings;
}

export function MuhanSettingsPanel({ adapter }: MuhanSettingsPanelProps = {}) {
	const adp = adapter ?? stubAdapter();
	const [machines, setMachines] = useState<RegisteredMachine[]>([]);
	const [vault, setVault] = useState<VaultEntryView[]>([]);
	const [busy, setBusy] = useState(false);
	const [newService, setNewService] = useState("");
	const [newSecret, setNewSecret] = useState("");

	const refresh = async () => {
		setBusy(true);
		try {
			const [m, v] = await Promise.all([adp.listMachines(), adp.listVault()]);
			setMachines(m);
			setVault(v);
		} finally {
			setBusy(false);
		}
	};

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const revoke = async (machineId: string) => {
		if (!confirm(`Revoke machine ${machineId}? Future sessions will not route to it.`)) return;
		setBusy(true);
		try {
			await adp.revokeMachine(machineId);
			await refresh();
		} finally {
			setBusy(false);
		}
	};

	const remove = async (service: string) => {
		if (!confirm(`Remove ${service} API key from vault?`)) return;
		setBusy(true);
		try {
			await adp.removeVaultEntry(service);
			await refresh();
		} finally {
			setBusy(false);
		}
	};

	const add = async () => {
		if (!newService || !newSecret) return;
		setBusy(true);
		try {
			await adp.addVaultEntry(newService, newSecret);
			setNewService("");
			setNewSecret("");
			await refresh();
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="muhan-settings-panel" style={{ display: "grid", gap: 24, padding: 16 }}>
			{/* Header */}
			<header style={{ display: "flex", alignItems: "center", gap: 12 }}>
				<ShieldCheck size={20} />
				<h2 style={{ margin: 0, fontSize: 18 }}>MuhanAI Integration</h2>
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

			{/* Registered machines */}
			<section>
				<h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<Monitor size={16} /> Registered Machines ({machines.length})
				</h3>
				<table style={{ width: "100%", borderCollapse: "collapse" }}>
					<thead>
						<tr>
							<th align="left">Label</th>
							<th align="left">Platform</th>
							<th align="left">Status</th>
							<th align="right">Reputation</th>
							<th align="right">Action</th>
						</tr>
					</thead>
					<tbody>
						{machines.map((m) => (
							<tr key={m.machineId} style={{ borderTop: "1px solid var(--cline-border)" }}>
								<td>{m.label}</td>
								<td>{m.platform}</td>
								<td>
									<span style={{ color: m.online ? "#22c55e" : "#94a3b8" }}>
										{m.online ? "online" : `last seen ${humanAgo(m.lastSeen)}`}
									</span>
								</td>
								<td align="right">{m.reputation.toFixed(2)}</td>
								<td align="right">
									<button
										type="button"
										onClick={() => revoke(m.machineId)}
										disabled={busy}
										style={{ color: "#ef4444" }}
									>
										<Trash2 size={14} /> Revoke
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>

			{/* Credentials vault */}
			<section>
				<h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<KeyRound size={16} /> Credentials Vault ({vault.length})
				</h3>
				<table style={{ width: "100%", borderCollapse: "collapse" }}>
					<thead>
						<tr>
							<th align="left">Service</th>
							<th align="left">Status</th>
							<th align="left">Updated</th>
							<th align="right">Action</th>
						</tr>
					</thead>
					<tbody>
						{vault.map((v) => (
							<tr key={v.service} style={{ borderTop: "1px solid var(--cline-border)" }}>
								<td>{v.service}</td>
								<td>{v.hasSecret ? "configured" : "missing"}</td>
								<td>{humanAgo(v.updatedAt)}</td>
								<td align="right">
									<button
										type="button"
										onClick={() => remove(v.service)}
										disabled={busy}
										style={{ color: "#ef4444" }}
									>
										<Trash2 size={14} /> Remove
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>

				<div style={{ display: "flex", gap: 8, marginTop: 12 }}>
					<input
						type="text"
						placeholder="service (e.g. openai)"
						value={newService}
						onChange={(e) => setNewService(e.target.value)}
						style={{ flex: 1 }}
					/>
					<input
						type="password"
						placeholder="API key"
						value={newSecret}
						onChange={(e) => setNewSecret(e.target.value)}
						style={{ flex: 2 }}
					/>
					<button type="button" onClick={add} disabled={busy || !newService || !newSecret}>
						Add
					</button>
				</div>
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
