import { describe, expect, it } from "vitest";
import {
	axlPeerIdFromDid,
	didFromAxlPeerId,
	IdentityRegistry,
	normalizePeerId,
} from "./identity-bridge.js";

const PEER_A = "a".repeat(64);
const PEER_B = "b".repeat(64);

describe("identity-bridge", () => {
	describe("didFromAxlPeerId", () => {
		it("derives a stable DID from the first 32 hex chars", () => {
			const did = didFromAxlPeerId(PEER_A);
			expect(did).toBe(`did:muhan:${"a".repeat(32)}`);
		});

		it("throws on malformed input", () => {
			expect(() => didFromAxlPeerId("xyz")).toThrow();
		});

		it("is round-trippable via axlPeerIdFromDid", () => {
			const did = didFromAxlPeerId(PEER_A);
			expect(axlPeerIdFromDid(did, [PEER_A, PEER_B])).toBe(PEER_A);
		});
	});

	describe("normalizePeerId", () => {
		it("accepts 64-char hex verbatim", () => {
			expect(normalizePeerId(PEER_B)).toBe(PEER_B);
		});

		it("resolves a unique 8-char prefix", () => {
			expect(normalizePeerId("bbbbbbbb", [PEER_A, PEER_B])).toBe(PEER_B);
		});

		it("returns null on ambiguous prefix", () => {
			expect(normalizePeerId("aa", [PEER_A, "a1".padEnd(64, "0")])).toBeNull();
		});

		it("resolves did:muhan:... via prefix match", () => {
			expect(normalizePeerId("did:muhan:" + "b".repeat(32), [PEER_A, PEER_B])).toBe(PEER_B);
		});
	});

	describe("IdentityRegistry", () => {
		it("stores and resolves records both ways", () => {
			const registry = new IdentityRegistry();
			registry.upsert({
				did: didFromAxlPeerId(PEER_A),
				axlPeerId: PEER_A,
			});

			expect(registry.getByPeerId(PEER_A)?.did).toBe(didFromAxlPeerId(PEER_A));
			expect(registry.getByDid(didFromAxlPeerId(PEER_A))?.axlPeerId).toBe(PEER_A);
			expect(registry.resolve(didFromAxlPeerId(PEER_A))).toBe(PEER_A);
			expect(registry.size()).toBe(1);
			expect(registry.list()).toHaveLength(1);
		});
	});
});
