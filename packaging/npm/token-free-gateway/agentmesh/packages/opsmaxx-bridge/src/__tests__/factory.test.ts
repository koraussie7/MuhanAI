import { describe, expect, it } from "vitest";

import { createInMemoryBridge } from "../mock.js";
import { BridgeError, RISK } from "../types.js";

function unwrap<T, E>(r: { ok: true; value: T } | { ok: false; error: E }): T {
	if (r.ok) return r.value;
	throw new Error("expected ok result");
}

describe("@agentmesh/opsmaxx-bridge mock", () => {
	it("starts empty", async () => {
		const b = createInMemoryBridge();
		const r = await b.vault.list();
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value).toEqual([]);
	});

	it("stores and retrieves vault metadata without exposing the secret", async () => {
		const b = createInMemoryBridge();
		await b.vault.set("openai", "sk-secret-xyz", "my key");
		const r = await b.vault.get("openai");
		expect(r.ok).toBe(true);
		if (r.ok && r.value) {
			expect(r.value.service).toBe("openai");
			expect(r.value.hasSecret).toBe(true);
			expect((r.value as unknown as { secret?: string }).secret).toBeUndefined();
		}
	});

	it("approval flow denies by default and accepts after __approve", async () => {
		const b = createInMemoryBridge();
		const card = {
			capability: "opsmaxx_db_write",
			risk: "high-risk-needs-double-approval" as const,
			summary: "DROP TABLE users",
			args: { sql: "DROP TABLE users" },
			preview: {},
		};
		const denied = unwrap(await b.security.requestApproval(card));
		expect(denied).toBe(false);
		b.__approve("opsmaxx_db_write", card.args);
		const ok = unwrap(await b.security.requestApproval(card));
		expect(ok).toBe(true);
	});

	it("declares every MCP tool in the risk registry", () => {
		const required = [
			"opsmaxx_ssh_exec",
			"opsmaxx_db_write",
			"opsmaxx_vault_set",
			"opsmaxx_sftp_read",
		];
		for (const name of required) {
			expect(RISK[name]).toBeDefined();
		}
		expect(RISK.opsmaxx_db_write).toBe("high-risk-needs-double-approval");
		expect(RISK.opsmaxx_vault_set).toBe("high-risk-needs-double-approval");
	});

	it("rejects unknown SSH session ids", async () => {
		const b = createInMemoryBridge();
		const r = await b.ssh.exec("does-not-exist", "ls");
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toBeInstanceOf(BridgeError);
	});
});
