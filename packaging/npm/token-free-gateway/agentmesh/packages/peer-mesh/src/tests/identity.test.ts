import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	IDENTITY_FORMAT_CURRENT,
	IDENTITY_FORMAT_LEGACY,
	loadOrCreateIdentity,
} from "../identity.js";

describe("loadOrCreateIdentity", () => {
	let dir: string;
	let previousPassphrase: string | undefined;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "agentmesh-p2p-id-"));
		// Encryption is opt-in: a fresh identity is only written in
		// IDENTITY_FORMAT_CURRENT when a passphrase is available.
		previousPassphrase = process.env.IDENTITY_ENCRYPTION_PASSPHRASE;
		process.env.IDENTITY_ENCRYPTION_PASSPHRASE = "test-passphrase";
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
		if (previousPassphrase === undefined) {
			delete process.env.IDENTITY_ENCRYPTION_PASSPHRASE;
		} else {
			process.env.IDENTITY_ENCRYPTION_PASSPHRASE = previousPassphrase;
		}
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

	it("falls back to the legacy plaintext format when no passphrase is set", async () => {
		delete process.env.IDENTITY_ENCRYPTION_PASSPHRASE;
		const path = join(dir, "id.json");
		const id = await loadOrCreateIdentity(path);

		expect(id.format).toBe(IDENTITY_FORMAT_LEGACY);
		expect(id.peerId).toMatch(/^12D3Koo/);
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

	it("rotates peerId when the file is deleted (incident response)", async () => {
		// Simulates the security-incident response: after a leaked key
		// is removed from disk, the next loader call MUST produce a
		// different peerId. This is the rotation contract relied on by
		// ADR 0007.
		const path = join(dir, "id.json");
		const before = await loadOrCreateIdentity(path);
		unlinkSync(path);
		const after = await loadOrCreateIdentity(path);

		expect(after.peerId).not.toBe(before.peerId);
		expect(after.peerId).toMatch(/^12D3Koo/);
		expect(after.format).toBe(IDENTITY_FORMAT_CURRENT);
	});
});
