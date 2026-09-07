/**
 * Persisted machine identity.
 *
 * On first run we generate an Ed25519 keypair via @agentmesh/p2p's
 * `loadOrCreateIdentity()` and write it to disk. Subsequent runs
 * load the same key — same peer-id, same machine record on the
 * gateway. The format is intentionally compatible with the p2p
 * package's identity file so a future unified identity store can
 * share keys.
 *
 * Phase 1 keeps the raw privateKey as `unknown`; L2 wires up
 * actual signing once the message transport is finalized.
 */

import { loadOrCreateIdentity } from "@agentmesh/p2p";

export interface MachineIdentity {
	/** Raw libp2p privateKey handle; concrete type lands in L2. */
	privateKey: unknown;
	peerId: string;
	machineId: string;
}

export async function loadMachineIdentity(opts: {
	/** Absolute path; default = ~/.muhanai/agent/identity.json */
	filePath?: string;
}): Promise<MachineIdentity> {
	const filePath = opts.filePath ?? `${process.env.HOME ?? "/tmp"}/.muhanai/agent/identity.json`;
	const loaded = await loadOrCreateIdentity(filePath);
	const machineId = `machine_${loaded.peerId.slice(-16)}`;
	return {
		privateKey: loaded.privateKey,
		peerId: loaded.peerId,
		machineId,
	};
}
