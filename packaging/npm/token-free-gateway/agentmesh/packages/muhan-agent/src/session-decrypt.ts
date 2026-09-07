/**
 * Session payload decryption.
 *
 * Wire format (envelope):
 *   { iv: Uint8Array(12), ciphertext: Uint8Array(*) }
 *
 * Key source:
 *   The session key is a per-(userId, sessionId) symmetric key escrowed
 *   to the machine at install time via install.sh (A4). Phase 1 keeps
 *   the key in memory — production will pull from the credentials vault
 *   once L4 lands. The decryption API is stable across both.
 *
 * Threat model:
 *   - Gateway sees ciphertext + routing metadata only.
 *   - A compromised gateway cannot decrypt sessions.
 *   - A passive observer (TLS-stripped libp2p) sees only ciphertext.
 *
 * Key rotation:
 *   Callers SHOULD rotate the session key on session-end; we do not
 *   keep a copy after use. The decrypt path requires the key to be
 *   re-supplied for each session.
 */

import type { SessionRoute } from "@agentmesh/gateway";

/** 32-byte symmetric key (AES-256-GCM). */
export type SessionKey = Uint8Array;

export interface DecryptedSession {
	sessionId: string;
	userId: string;
	/** Plaintext request payload (JSON-decoded). */
	payload: unknown;
	/** ms since epoch the route was issued. */
	issuedAt: number;
}

export interface SessionEnvelope {
	iv: Uint8Array;
	ciphertext: Uint8Array;
}

const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * Encrypt a session payload with AES-256-GCM.
 * Returns an envelope suitable for embedding in a SessionRoute.ciphertext.
 */
export async function encryptSessionPayload(
	payload: unknown,
	key: SessionKey,
): Promise<SessionEnvelope> {
	assertKey(key);
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const plaintext = new TextEncoder().encode(JSON.stringify(payload));
	const ciphertext = await aesGcmEncrypt(key, iv, plaintext);
	return { iv, ciphertext };
}

/**
 * Decrypt a session payload from a SessionRoute.
 * Throws if the route is malformed or the key/cipher mismatch.
 */
export async function decryptSessionRoute(
	route: SessionRoute,
	key: SessionKey,
): Promise<DecryptedSession> {
	assertKey(key);
	const envelope = parseEnvelope(route.ciphertext);
	const plaintext = await aesGcmDecrypt(key, envelope.iv, envelope.ciphertext);
	const payload = JSON.parse(new TextDecoder().decode(plaintext));
	return {
		sessionId: route.sessionId,
		userId: route.userId,
		payload,
		issuedAt: route.issuedAt,
	};
}

function parseEnvelope(bytes: Uint8Array): SessionEnvelope {
	// First 12 bytes = IV, rest = ciphertext (incl. 16-byte GCM tag).
	if (bytes.byteLength < IV_BYTES + 16) {
		throw new Error("session envelope too short");
	}
	return {
		iv: bytes.slice(0, IV_BYTES),
		ciphertext: bytes.slice(IV_BYTES),
	};
}

function assertKey(key: SessionKey): void {
	if (!(key instanceof Uint8Array)) {
		throw new Error("session key must be a Uint8Array");
	}
	if (key.byteLength !== KEY_BYTES) {
		throw new Error(`session key must be ${KEY_BYTES} bytes, got ${key.byteLength}`);
	}
}

// WebCrypto wrappers — `globalThis.crypto.subtle` is available in Node 22.
async function aesGcmEncrypt(
	key: SessionKey,
	iv: Uint8Array,
	plaintext: Uint8Array,
): Promise<Uint8Array> {
	const ck = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"]);
	const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, ck, plaintext);
	return new Uint8Array(ct);
}

async function aesGcmDecrypt(
	key: SessionKey,
	iv: Uint8Array,
	ciphertext: Uint8Array,
): Promise<Uint8Array> {
	const ck = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["decrypt"]);
	const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, ck, ciphertext);
	return new Uint8Array(pt);
}
