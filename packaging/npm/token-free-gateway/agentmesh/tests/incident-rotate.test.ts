/**
 * Incident-response utility: regenerate the on-disk identity.
 *
 * Run manually after a key compromise (or any time the operator wants to
 * rotate peerId) with:
 *
 *   AGENTMESH_INCIDENT_ROTATE=1 pnpm test tests/incident-rotate.test.ts
 *
 * Skipped unless AGENTMESH_INCIDENT_ROTATE=1 is set, so CI never trips it.
 * Records the OLD peerId + private-key SHA-256 fingerprint in stdout BEFORE
 * deleting the file, for audit trail purposes.
 *
 * See ADR 0007 — peer identity rotation protocol.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	IDENTITY_FORMAT_CURRENT,
	loadOrCreateIdentity,
} from "../packages/p2p/src/identity.js";

const PATH = "./.agentmesh/identity.json";
const ROTATE = process.env.AGENTMESH_INCIDENT_ROTATE === "1";

describe.skipIf(!ROTATE)("incident rotation — on-disk .agentmesh/identity.json", () => {
	it("regenerates peerId + persists with 0600", async () => {
		if (existsSync(PATH)) {
			const oldRaw = JSON.parse(readFileSync(PATH, "utf8"));
			const oldFingerprint = createHash("sha256")
				.update(oldRaw.privateKeyB64)
				.digest("hex");
			// Logged for audit — never the raw key.
			console.log(`OLD_PEER_ID           = ${oldRaw.peerId}`);
			console.log(`OLD_CREATED           = ${oldRaw.createdAt}`);
			console.log(`OLD_PRIVKEY_SHA256    = ${oldFingerprint}`);
		} else {
			console.log("OLD_PEER_ID           = <no prior file>");
		}

		const id = await loadOrCreateIdentity(PATH);
		const st = statSync(PATH);

		console.log(`NEW_PEER_ID           = ${id.peerId}`);
		console.log(`NEW_FILE_MODE         = ${(st.mode & 0o777).toString(8)}`);

		expect(id.format).toBe(IDENTITY_FORMAT_CURRENT);
		expect(id.peerId).toMatch(/^12D3Koo/);
		expect(st.mode & 0o777).toBe(0o600);
	});
});