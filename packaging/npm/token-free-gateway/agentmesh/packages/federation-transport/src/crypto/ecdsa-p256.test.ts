/**
 * Tests for ecdsa-p256 hex parsing and round-trip behavior.
 * Covers the bug fixed in 1-5: hexToBuffer silently produced NaN bytes
 * for odd-length or non-hex input. verify() caught the resulting import
 * failure via try/catch, but downstream callers that consumed the buffer
 * directly (e.g. computeFingerprint) would have seen garbage.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { computeFingerprint, hexToBuffer } from "./ecdsa-p256";

test("hexToBuffer: round-trips a known hex string", () => {
	const hex = "deadbeef";
	const buf = hexToBuffer(hex);
	assert.equal(new Uint8Array(buf).join(","), "222,173,190,239");
});

test("hexToBuffer: rejects empty string", () => {
	// Empty input is never a valid key/signature; fail loud.
	assert.throws(() => hexToBuffer(""), /hex string must have even length/);
});

test("hexToBuffer: rejects odd-length hex", () => {
	assert.throws(() => hexToBuffer("abc"), /even length/);
});

test("hexToBuffer: rejects non-hex characters", () => {
	assert.throws(() => hexToBuffer("zz"), /invalid hex/);
	assert.throws(() => hexToBuffer("XXyy"), /invalid hex/);
});

test("hexToBuffer: rejects non-string input", () => {
	assert.throws(() => hexToBuffer(123 as unknown as string), /must be a string/);
	assert.throws(() => hexToBuffer(null as unknown as string), /must be a string/);
});

test("hexToBuffer: preserves leading zeros", () => {
	const buf = hexToBuffer("00010203");
	assert.equal(new Uint8Array(buf).join(","), "0,1,2,3");
});

test("hexToBuffer: handles a full 64-byte public key hex (P-256 SPKI)", () => {
	// Real-world P-256 SPKI public keys are ~91 bytes. Build a synthetic 92-byte
	// blob (1 prefix + 91 body) and assert byte count + leading byte.
	const hex = `30${"59".repeat(91)}`;
	const buf = hexToBuffer(hex);
	assert.equal(buf.byteLength, 92);
	const bytes = new Uint8Array(buf);
	assert.equal(bytes[0], 0x30);
	assert.equal(bytes[bytes.length - 1], 0x59);
});

test("computeFingerprint: produces deterministic 16-byte hex", async () => {
	const { generateKeyPair } = await import("./ecdsa-p256");
	const kp = await generateKeyPair();
	const fp1 = computeFingerprint(kp.publicKey);
	const fp2 = computeFingerprint(kp.publicKey);
	assert.equal(fp1, fp2);
	assert.equal(fp1.length, 32); // 16 bytes = 32 hex chars
});
