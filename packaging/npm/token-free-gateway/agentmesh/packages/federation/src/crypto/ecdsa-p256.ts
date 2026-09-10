/**
 * ECDSA P-256 signing primitives for the federation-transport package.
 *
 * NOTE — historical name:
 *   This module previously lived at `./ed25519.ts`, but the implementation
 *   uses WebCrypto ECDSA with the NIST P-256 (a.k.a. prime256v1 / ES256)
 *   curve — not Ed25519. The deprecated `./ed25519.ts` path is preserved
 *   as a re-export shim for any callers still importing the old name;
 *   it will be removed in a future major release.
 *
 * External callers should import from `@agentmesh/federation`
 * which re-exports these symbols under their original names
 * (`generateKeyPair`, `sign`, `verify`, `computeFingerprint`).
 */

import { webcrypto } from "node:crypto";

export interface KeyPair {
	publicKey: string;
	privateKey: string;
}

export async function generateKeyPair(): Promise<KeyPair> {
	const keyPair = await webcrypto.subtle.generateKey(
		{
			name: "ECDSA",
			namedCurve: "P-256",
		},
		true,
		["sign", "verify"],
	);

	const publicKeyBuffer = await webcrypto.subtle.exportKey("spki", keyPair.publicKey);
	const privateKeyBuffer = await webcrypto.subtle.exportKey("pkcs8", keyPair.privateKey);

	return {
		publicKey: bufferToHex(publicKeyBuffer),
		privateKey: bufferToHex(privateKeyBuffer),
	};
}

export async function sign(data: string, privateKeyHex: string): Promise<string> {
	const privateKeyBuffer = hexToBuffer(privateKeyHex);
	const privateKey = await webcrypto.subtle.importKey(
		"pkcs8",
		privateKeyBuffer,
		{
			name: "ECDSA",
			namedCurve: "P-256",
		},
		false,
		["sign"],
	);

	const encoder = new TextEncoder();
	const signature = await webcrypto.subtle.sign(
		{
			name: "ECDSA",
			hash: "SHA-256",
		},
		privateKey,
		encoder.encode(data),
	);

	return bufferToHex(signature);
}

export async function verify(
	data: string,
	signatureHex: string,
	publicKeyHex: string,
): Promise<boolean> {
	try {
		const publicKeyBuffer = hexToBuffer(publicKeyHex);
		const publicKey = await webcrypto.subtle.importKey(
			"spki",
			publicKeyBuffer,
			{
				name: "ECDSA",
				namedCurve: "P-256",
			},
			false,
			["verify"],
		);

		const encoder = new TextEncoder();
		const signatureBuffer = hexToBuffer(signatureHex);

		return webcrypto.subtle.verify(
			{
				name: "ECDSA",
				hash: "SHA-256",
			},
			publicKey,
			signatureBuffer,
			encoder.encode(data),
		);
	} catch {
		return false;
	}
}

export function computeFingerprint(publicKeyHex: string): string {
	const buffer = hexToBuffer(publicKeyHex);
	const hash = new Uint8Array(buffer);
	return bufferToHex(hash.slice(0, 16));
}

function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
	const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	return Array.from(bytes)
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

export function hexToBuffer(hex: string): ArrayBuffer {
	if (typeof hex !== "string") {
		throw new TypeError("hexToBuffer: input must be a string");
	}
	if (hex.length === 0 || hex.length % 2 !== 0) {
		throw new Error("hexToBuffer: hex string must have even length");
	}
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) {
		const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
		if (!Number.isFinite(byte)) {
			throw new Error(`hexToBuffer: invalid hex at byte ${i}`);
		}
		out[i] = byte;
	}
	return out.buffer;
}
