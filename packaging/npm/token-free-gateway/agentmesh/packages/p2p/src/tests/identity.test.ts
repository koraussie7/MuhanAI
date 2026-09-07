import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IDENTITY_FORMAT_CURRENT, loadOrCreateIdentity } from "../identity.js";

describe("loadOrCreateIdentity", () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "agentmesh-p2p-id-"));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("creates a new identity on first call", async () => {
		const path = join(dir, "id.json");
		const id = await loadOrCreateIdentity(path);

		expect(id.format).toBe(IDENTITY_FORMAT_CURRENT);
		expect(id.peerId).toMatch(/^12D3Koo/);
		expect(id.privateKey).toBeDefined();

		// File should exist with 0o600 perms.
		const stat = readFileSync(path);
		expect(stat.length).toBeGreaterThan(0);

		const parsed = JSON.parse(stat.toString("utf8"));
		expect(parsed.format).toBe(IDENTITY_FORMAT_CURRENT);
		expect(parsed.peerId).toBe(id.peerId);
	});

	it("returns the same identity on subsequent calls", async () => {
		const path = join(dir, "id.json");
		const a = await loadOrCreateIdentity(path);
		const b = await loadOrCreateIdentity(path);
		expect(b.peerId).toBe(a.peerId);
	});

	it("recovers from corrupt identity file", async () => {
		const path = join(dir, "id.json");
		writeFileSync(path, "{ not json", "utf8");
		const id = await loadOrCreateIdentity(path);
		expect(id.peerId).toMatch(/^12D3Koo/);
	});
});
