/**
 * T2 sanity test for the OpsMaxx vault adapter.
 *
 * Verifies the four contract guarantees documented at the top of
 * `opsmaxx-vault-adapter.ts`:
 *
 *   1. Secrets stay on the OpsMaxx side; the local vault holds
 *      metadata only.
 *   2. `put` writes the local blob first, then mirrors to OpsMaxx.
 *   3. Resync does not crash when the bridge is unreachable.
 *   4. A newer OpsMaxx entry evicts the local metadata entry.
 *   5. `get` is OpsMaxx-backed: a missing local entry is served from
 *      the bridge as metadata only.
 */

import { createInMemoryBridge } from "@agentmesh/opsmaxx-bridge/mock";
import { describe, expect, it } from "vitest";

import { createOpsMaxxVaultAdapter } from "./opsmaxx-vault-adapter.js";

const PASSPHRASE = "correct horse battery staple";

describe("opsmaxx-vault-adapter (T2)", () => {
	it("seeds local metadata from OpsMaxx and never copies the secret", async () => {
		const bridge = createInMemoryBridge();
		await bridge.vault.set("openai", "sk-remote-123", "remote key");

		const adapter = await createOpsMaxxVaultAdapter({
			bridge,
			passphrase: PASSPHRASE,
		});

		const list = adapter.list();
		const entry = list.find((e) => e.service === "openai");
		expect(entry).toBeDefined();
		expect(entry?.secret).toBe("");
		// The secret value is NOT seeded.
		expect(entry?.secret === "sk-remote-123").toBe(false);

		await adapter.close();
	});

	it("put writes the local blob first, then mirrors to OpsMaxx", async () => {
		const bridge = createInMemoryBridge();
		const adapter = await createOpsMaxxVaultAdapter({
			bridge,
			passphrase: PASSPHRASE,
		});

		const blob = await adapter.put({
			service: "anthropic",
			secret: "sk-anthropic-xyz",
			note: "from local",
			updatedAt: Date.now(),
		});

		expect(blob).toBeDefined();
		expect((await adapter.get("anthropic"))?.secret).toBe("sk-anthropic-xyz");

		// Mirror should have run.
		const remoteList = await bridge.vault.list();
		expect(remoteList.ok).toBe(true);
		if (remoteList.ok) {
			expect(remoteList.value.find((e) => e.service === "anthropic")).toBeDefined();
		}

		await adapter.close();
	});

	it("resync survives a broken bridge without throwing", async () => {
		const bridge = createInMemoryBridge();
		// Simulate a broken bridge by closing it before resync.
		await bridge.close();
		const adapter = await createOpsMaxxVaultAdapter({
			bridge,
			passphrase: PASSPHRASE,
		});

		const report = await adapter.resync();
		expect(report.addedFromOpsMaxx).toEqual([]);
		expect(report.evictedLocally).toEqual([]);
		expect(report.conflicts).toEqual([]);

		await adapter.close();
	});

	it("a newer OpsMaxx entry evicts the local metadata", async () => {
		const bridge = createInMemoryBridge();
		// Seed an explicitly-old entry on the OpsMaxx side so the local
		// vault's `put` (which always mirrors) creates a strictly newer
		// timestamp on the bridge; we then push an even newer one to
		// force the eviction branch deterministically.
		await bridge.vault.set("openai", "sk-very-old", "old");
		const adapter = await createOpsMaxxVaultAdapter({
			bridge,
			passphrase: PASSPHRASE,
		});

		// Local put mirrors to OpsMaxx with `Date.now()`. Then we
		// wait one tick and push a strictly-newer entry on the bridge.
		await adapter.put({
			service: "openai",
			secret: "sk-local-1",
			updatedAt: Date.now(),
		});
		await new Promise((r) => setTimeout(r, 5));
		await bridge.vault.set("openai", "sk-newer-remote", "newer");

		const report = await adapter.resync();
		expect(report.conflicts).toContain("openai");
		expect(report.evictedLocally).toContain("openai");

		// After eviction, the local entry is gone…
		expect(adapter.list().find((e) => e.service === "openai")).toBeUndefined();
		// …but `get` falls back to OpsMaxx and returns metadata only.
		const remoteBacked = await adapter.get("openai");
		expect(remoteBacked).not.toBeNull();
		expect(remoteBacked?.service).toBe("openai");
		expect(remoteBacked?.hasSecret).toBe(true);
		expect(remoteBacked?.secret).toBe("");

		await adapter.close();
	});

	it("get() fetches remote metadata when the local entry is missing", async () => {
		const bridge = createInMemoryBridge();
		const adapter = await createOpsMaxxVaultAdapter({
			bridge,
			passphrase: PASSPHRASE,
		});

		// Service exists only on the OpsMaxx side, created after the
		// construction-time resync so it was never seeded locally.
		await bridge.vault.set("anthropic", "sk-anthropic", "remote note");

		const entry = await adapter.get("anthropic");
		expect(entry).not.toBeNull();
		expect(entry?.service).toBe("anthropic");
		expect(entry?.hasSecret).toBe(true);
		// Metadata only — never the raw secret.
		expect(entry?.secret === "sk-anthropic").toBe(false);

		await adapter.close();
	});
});
