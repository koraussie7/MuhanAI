import { publicKeyFromRaw } from "@libp2p/crypto/keys";
import { ed25519 } from "@noble/curves/ed25519";
import { describe, expect, it } from "vitest";

import { MIN_VERIFICATION_RATE, TrustVerifier } from "../trust-verifier.js";

function makeEd25519PublicKey(): {
	raw: Uint8Array;
	key: ReturnType<typeof publicKeyFromRaw>;
} {
	const seed = ed25519.utils.randomPrivateKey();
	const raw = ed25519.getPublicKey(seed);
	return { raw, key: publicKeyFromRaw(raw) };
}

describe("TrustVerifier — MIN_VERIFICATION_RATE", () => {
	it("exports HiveBear's 0.01 floor", () => {
		expect(MIN_VERIFICATION_RATE).toBe(0.01);
	});
});

describe("TrustVerifier — TOFU first encounter", () => {
	it("returns 'tofu' + records key on first verify", () => {
		const v = new TrustVerifier();
		const { key, raw } = makeEd25519PublicKey();
		const out = v.verify("peer-A", key);
		expect(out.status).toBe("tofu");
		expect(out.peerId).toBe("peer-A");
		expect(out.publicKey?.raw).toEqual(raw);
		expect(v.isKnown("peer-A")).toBe(true);
	});

	it("seeds record with verifiedCount=1 and timestamps", () => {
		const v = new TrustVerifier();
		const { key } = makeEd25519PublicKey();
		const before = Date.now();
		v.verify("peer-A", key);
		const after = Date.now();
		const rec = v.get("peer-A");
		expect(rec?.verifiedCount).toBe(1);
		expect(rec?.firstSeen).toBeGreaterThanOrEqual(before);
		expect(rec?.firstSeen).toBeLessThanOrEqual(after);
		expect(rec?.lastVerified).toBe(rec?.firstSeen);
	});
});

describe("TrustVerifier — verified on subsequent matches", () => {
	it("returns 'verified' for same key on second call", () => {
		const v = new TrustVerifier();
		const { key } = makeEd25519PublicKey();
		v.verify("peer-A", key); // tofu
		const out = v.verify("peer-A", key); // verified
		expect(out.status).toBe("verified");
	});

	it("increments verifiedCount across multiple verify calls", () => {
		const v = new TrustVerifier();
		const { key } = makeEd25519PublicKey();
		v.verify("peer-A", key);
		v.verify("peer-A", key);
		v.verify("peer-A", key);
		expect(v.get("peer-A")?.verifiedCount).toBe(3);
	});

	it("updates lastVerified timestamp on each verify", async () => {
		const v = new TrustVerifier();
		const { key } = makeEd25519PublicKey();
		v.verify("peer-A", key);
		const first = v.get("peer-A")?.lastVerified ?? 0;
		// small delay so Date.now() can advance on coarse-grained clocks
		await new Promise((r) => setTimeout(r, 5));
		v.verify("peer-A", key);
		const second = v.get("peer-A")?.lastVerified ?? 0;
		expect(second).toBeGreaterThanOrEqual(first);
	});
});

describe("TrustVerifier — mismatch detection", () => {
	it("returns 'mismatch' when key changes", () => {
		const v = new TrustVerifier();
		const { key: key1 } = makeEd25519PublicKey();
		v.verify("peer-A", key1);

		const { key: key2 } = makeEd25519PublicKey();
		const out = v.verify("peer-A", key2);
		expect(out.status).toBe("mismatch");
		expect(out.reason).toMatch(/public key/);
	});

	it("does NOT overwrite original key on mismatch", () => {
		const v = new TrustVerifier();
		const { key: key1, raw: raw1 } = makeEd25519PublicKey();
		v.verify("peer-A", key1);

		const { key: key2 } = makeEd25519PublicKey();
		v.verify("peer-A", key2);

		// Original key pin should still be intact
		expect(v.get("peer-A")?.publicKey.raw).toEqual(raw1);
	});

	it("does NOT increment verifiedCount on mismatch", () => {
		const v = new TrustVerifier();
		const { key: key1 } = makeEd25519PublicKey();
		v.verify("peer-A", key1);
		const before = v.get("peer-A")?.verifiedCount ?? 0;

		const { key: key2 } = makeEd25519PublicKey();
		v.verify("peer-A", key2);
		const after = v.get("peer-A")?.verifiedCount ?? 0;
		expect(after).toBe(before);
	});
});

describe("TrustVerifier — isKnown / get / remove", () => {
	it("isKnown returns false for unknown peer", () => {
		const v = new TrustVerifier();
		expect(v.isKnown("ghost")).toBe(false);
	});

	it("get returns undefined for unknown peer", () => {
		const v = new TrustVerifier();
		expect(v.get("ghost")).toBeUndefined();
	});

	it("remove deletes record", () => {
		const v = new TrustVerifier();
		const { key } = makeEd25519PublicKey();
		v.verify("peer-A", key);
		expect(v.remove("peer-A")).toBe(true);
		expect(v.isKnown("peer-A")).toBe(false);
		// second remove returns false
		expect(v.remove("peer-A")).toBe(false);
	});

	it("size reflects number of pinned peers", () => {
		const v = new TrustVerifier();
		expect(v.size()).toBe(0);
		const { key: k1 } = makeEd25519PublicKey();
		const { key: k2 } = makeEd25519PublicKey();
		v.verify("A", k1);
		v.verify("B", k2);
		expect(v.size()).toBe(2);
	});

	it("all returns snapshot of records", () => {
		const v = new TrustVerifier();
		const { key: k1 } = makeEd25519PublicKey();
		const { key: k2 } = makeEd25519PublicKey();
		v.verify("A", k1);
		v.verify("B", k2);
		const snap = v.all();
		expect(snap.length).toBe(2);
		const ids = snap.map((r) => r.peerId).sort();
		expect(ids).toEqual(["A", "B"]);
	});
});

describe("TrustVerifier — post-removal re-pin", () => {
	it("after remove(), next verify starts fresh TOFU", () => {
		const v = new TrustVerifier();
		const { key: k1 } = makeEd25519PublicKey();
		const { key: k2 } = makeEd25519PublicKey();
		v.verify("peer-A", k1);
		v.remove("peer-A");
		const out = v.verify("peer-A", k2);
		expect(out.status).toBe("tofu");
		expect(v.get("peer-A")?.publicKey.raw).toEqual(k2.raw);
	});
});
