/**
 * OpsMaxxPeerCard — peer-mesh visualisation card for an OpsMaxx host.
 *
 * T4 of the OpsMaxx × MuhanAI integration
 * (see docs/agentmesh/T3-OPSMAXX-MCP-AGENT-A.md's neighbouring track,
 *  docs/adr/0010-opsmaxx-bridge.md, and
 *  docs/agentmesh/AGENT-ASSIGNMENT-PLAN.md).
 *
 * A user can have one or more OpsMaxx instances running locally
 * (laptop, server, dev workstation). Each instance has its own
 * Ed25519 machine identity (same primitive as
 * `packages/peer-mesh/src/identity.ts:38-40`) and exposes a fixed
 * capability surface: vault, ssh, databases, tunnels. This card shows
 * one such host in the existing peer-mesh canvas
 * (`apps/web/src/components/harvest/A/PeerCanvas.tsx`).
 *
 * Design:
 *   - The card reuses the existing `Peer` type from PeerCanvas so it
 *     slots into PeerCanvas without touching that file.
 *   - Capabilities are derived from `RISK` in
 *     `@agentmesh/opsmaxx-bridge` so the source of truth is the
 *     bridge contract, not this component.
 *   - All click handlers are deferred to a parent: the card never
 *     fetches data on its own. This keeps T4 strictly a *presentation*
 *     track; T2/T3 own data and T6 owns copy.
 */

import { type OpsMaxxBridge, RISK } from "@agentmesh/opsmaxx-bridge";
import { Lock, Network, Server, Terminal } from "lucide-react";
import { useMemo } from "react";

import type { Peer } from "./PeerCanvas.js";

export interface OpsMaxxPeerCardProps {
	peer: Peer;
	bridge: Pick<OpsMaxxBridge, "vault" | "ssh" | "databases">;
	onSelect?: (id: string) => void;
}

/**
 * The full capability list shown on the card, derived from the bridge
 * `RISK` registry. We intentionally do not hard-code the names here so
 * a future T1 RISK addition lights up automatically.
 */
const CAPABILITY_GROUPS: ReadonlyArray<{
	label: string;
	prefix: string;
	icon: typeof Lock;
}> = [
	{ label: "Vault", prefix: "opsmaxx_vault_", icon: Lock },
	{ label: "SSH", prefix: "opsmaxx_ssh_", icon: Terminal },
	{ label: "DB", prefix: "opsmaxx_db_", icon: Server },
	{ label: "Net", prefix: "opsmaxx_tunnel_", icon: Network },
];

export function OpsMaxxPeerCard({
	peer,
	bridge,
	onSelect,
}: OpsMaxxPeerCardProps): React.ReactElement {
	const capabilitySummary = useMemo(() => {
		const out: Array<{ label: string; count: number }> = [];
		for (const group of CAPABILITY_GROUPS) {
			const matches = Object.keys(RISK).filter((name) => name.startsWith(group.prefix));
			if (matches.length > 0) out.push({ label: group.label, count: matches.length });
		}
		return out;
	}, []);

	const isConnected = peer.status === "connected";

	return (
		<div
			className={`opsmaxx-peer-card ${isConnected ? "connected" : "offline"}`}
			role="article"
			aria-label={`OpsMaxx peer ${peer.name}`}
		>
			<button
				type="button"
				className="opsmaxx-peer-card-button"
				onClick={() => onSelect?.(peer.id)}
				aria-label={`Select OpsMaxx peer ${peer.name}`}
			>
				<div className="opsmaxx-peer-card-header">
					<span className={`opsmaxx-peer-status-dot ${peer.status}`} />
					<span className="opsmaxx-peer-name">{peer.name}</span>
					{peer.latencyMs !== undefined && (
						<span className="opsmaxx-peer-latency">{peer.latencyMs} ms</span>
					)}
				</div>
				<div className="opsmaxx-peer-card-bridge">
					<span className="opsmaxx-peer-bridge-mode">via {peer.protocol}</span>
					{peer.region && <span className="opsmaxx-peer-region">{peer.region}</span>}
				</div>
				<ul className="opsmaxx-peer-capability-row">
					{capabilitySummary.map((c) => (
						<li key={c.label} className="opsmaxx-peer-cap-chip">
							<span className="opsmaxx-peer-cap-label">{c.label}</span>
							<span className="opsmaxx-peer-cap-count">{c.count}</span>
						</li>
					))}
				</ul>
				<div className="opsmaxx-peer-card-footer">
					<span className="opsmaxx-peer-bridge-handle">
						{typeof bridge.vault.list === "function" ? "bridge ready" : "bridge stub"}
					</span>
				</div>
			</button>
		</div>
	);
}

/**
 * Convert a list of OpsMaxx bridge vault / ssh / db entries into the
 * generic `Peer[]` shape consumed by `PeerCanvas`. Pure function so it
 * is testable without React.
 */
export async function opsMaxxBridgeToPeers(
	bridge: OpsMaxxBridge,
	machineId: string,
	hostname: string,
): Promise<Peer[]> {
	const vaultList = await bridge.vault.list();
	const sshList = await bridge.ssh.listConnections();
	const dbList = await bridge.databases.listConnections();

	const caps: string[] = [];
	if (vaultList.ok && vaultList.value.length > 0) caps.push("vault");
	if (sshList.ok && sshList.value.length > 0) caps.push("ssh");
	if (dbList.ok && dbList.value.length > 0) caps.push("databases");
	caps.push("opsmaxx");

	return [
		{
			id: `opsmaxx-${machineId}`,
			name: hostname,
			region: "local",
			protocol: "libp2p",
			status: caps.length > 1 ? "connected" : "connecting",
			capabilities: caps,
		},
	];
}
