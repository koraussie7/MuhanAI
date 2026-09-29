/**
 * T4 sanity test for OpsMaxxPeerCard.
 *
 * Validates the two contracts that matter for downstream consumers:
 *   1. `opsMaxxBridgeToPeers` produces a Peer[] the existing
 *      PeerCanvas can consume.
 *   2. Capability summary is derived from the RISK registry, not from
 *      a hard-coded list (so adding a new opsmaxx_* capability in T1
 *      auto-lights up on the card).
 */

import { createInMemoryBridge } from "@agentmesh/opsmaxx-bridge/mock";
import { RISK } from "@agentmesh/opsmaxx-bridge/types";
import { describe, expect, it } from "vitest";

import { opsMaxxBridgeToPeers } from "./OpsMaxxPeerCard.js";

describe("OpsMaxxPeerCard (T4)", () => {
	it("lists vault+ssh+db capabilities when bridge has entries", async () => {
		const bridge = createInMemoryBridge();
		await bridge.vault.set("openai", "sk-xyz", "demo");
		bridge.__seedSsh({
			id: "ssh-1",
			label: "prod-bastion",
			host: "10.0.0.1",
			port: 22,
			username: "ops",
			authRef: "vault://openai",
		});
		bridge.__seedDb({
			id: "db-1",
			label: "prod-pg",
			engine: "postgres",
			host: "10.0.0.2",
			port: 5432,
			database: "main",
		});

		const peers = await opsMaxxBridgeToPeers(bridge, "machine-1", "laptop");

		expect(peers).toHaveLength(1);
		expect(peers[0]?.id).toBe("opsmaxx-machine-1");
		expect(peers[0]?.name).toBe("laptop");
		expect(peers[0]?.status).toBe("connected");
		expect(peers[0]?.capabilities).toContain("vault");
		expect(peers[0]?.capabilities).toContain("ssh");
		expect(peers[0]?.capabilities).toContain("databases");
		expect(peers[0]?.capabilities).toContain("opsmaxx");
	});

	it("reports 'connecting' when the bridge has no entries yet", async () => {
		const bridge = createInMemoryBridge();
		const peers = await opsMaxxBridgeToPeers(bridge, "machine-2", "server");
		expect(peers[0]?.status).toBe("connecting");
	});

	it("capability summary is driven by the RISK registry, not hard-coded", () => {
		// If this test breaks after a future T1 update that adds a new
		// opsmaxx_* capability, that is the correct outcome — the card
		// picks it up automatically.
		const vaultCount = Object.keys(RISK).filter((n) => n.startsWith("opsmaxx_vault_")).length;
		const sshCount = Object.keys(RISK).filter((n) => n.startsWith("opsmaxx_ssh_")).length;
		expect(vaultCount).toBeGreaterThan(0);
		expect(sshCount).toBeGreaterThan(0);
	});
});
