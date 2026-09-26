/**
 * Ed25519 identity loader with forward-compatible format marker.
 *
 * Pattern source: folklore/peer-transport.ts (loadOrCreateIdentity) +
 * HiveBear/crates/hivebear-mesh/src/identity.rs (NodeIdentity) +
 * p2pclaw DID did:p2pclaw:<bs58(ed25519)>.
 *
 * Format versions:
 *   ed25519-raw-v1   — plaintext 64-byte seed (legacy, for backward compatibility)
 *   ed25519-enc-v1   — AES-256-GCM encrypted seed, key derived from passphrase (PBKDF2)
 */

import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { privateKeyFromRaw } from "@libp2p/crypto/keys";
import type { PrivateKey } from "@libp2p/interface";
import { peerIdFromPrivateKey } from "@libp2p/peer-id";
import { ed25519 } from "@noble/curves/ed25519";

export const IDENTITY_FORMAT_CURRENT = "ed25519-enc-v1" as const;
export const IDENTITY_FORMAT_LEGACY = "ed25519-raw-v1" as const;

export interface IdentityFile {
	format: string;
	privateKeyB64: string; // base64 of raw seed (legacy) or encrypted payload (enc)
	peerId: string;
	createdAt: string;
	salt?: string; // base64 salt for PBKDF2 (enc format)
	iv?: string; // base64 IV for AES-GCM (enc format)
	authTag?: string; // base64 auth tag (enc format)
}

export interface LoadedIdentity {
	privateKey: PrivateKey;
	peerId: string;
	format: string;
}

function generateRawEd25519(): Uint8Array {
	const seed = ed25519.utils.randomPrivateKey();
	const pub = ed25519.getPublicKey(seed);
	const out = new Uint8Array(64);
	out.set(seed, 0);
	out.set(pub, 32);
	return out;
}

function deriveKey(passphrase: string, salt: Uint8Array): Uint8Array {
	// PBKDF2 with 100k iterations, SHA-256, 32-byte key
	return pbkdf2Sync(passphrase, salt, 100_000, 32, "sha256");
}

function encryptPayload(
	payload: Uint8Array,
	passphrase: string,
): { ciphertext: Uint8Array; salt: Uint8Array; iv: Uint8Array; authTag: Uint8Array } {
	const salt = randomBytes(16);
	const iv = randomBytes(12);
	const key = deriveKey(passphrase, salt);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
	const authTag = cipher.getAuthTag();
	return { ciphertext, salt, iv, authTag };
}

function decryptPayload(
	ciphertext: Uint8Array,
	passphrase: string,
	salt: Uint8Array,
	iv: Uint8Array,
	authTag: Uint8Array,
): Uint8Array {
	const key = deriveKey(passphrase, salt);
	const decipher = createDecipheriv("aes-256-gcm", key, iv);
	decipher.setAuthTag(authTag);
	const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	return plaintext;
}

function getPassphrase(): string | null {
	// Passphrase can be provided via environment variable.
	// If not set, we fall back to plaintext format (legacy).
	return process.env.IDENTITY_ENCRYPTION_PASSPHRASE ?? null;
}

export async function loadOrCreateIdentity(path: string): Promise<LoadedIdentity> {
	const { mkdir, readFile, writeFile } = await import("node:fs/promises");
	const { dirname } = await import("node:path");
	let existing: IdentityFile | null = null;

	try {
		const raw = await readFile(path, "utf8");
		existing = JSON.parse(raw) as IdentityFile;
	} catch (e) {
		const code = (e as NodeJS.ErrnoException).code;
		if (code !== "ENOENT") {
			const backupPath = `${path}.corrupt.${Date.now()}`;
			try {
				await writeFile(backupPath, "corrupt identity backup", "utf8");
			} catch {
				// best-effort — keep going
			}
		}
	}

	const passphrase = getPassphrase();

	// If existing file is legacy plaintext format, we can migrate to encrypted format if passphrase is provided.
	if (existing && existing.format === IDENTITY_FORMAT_LEGACY) {
		const raw = Buffer.from(existing.privateKeyB64, "base64");
		if (raw.length !== 64) {
			throw new Error(`identity: expected 64 bytes, got ${raw.length}`);
		}
		const privateKey = privateKeyFromRaw(raw);
		const peerId = peerIdFromPrivateKey(privateKey);

		// If passphrase is provided, migrate to encrypted format.
		if (passphrase) {
			const rawSeed = Buffer.from(existing.privateKeyB64, "base64");
			const { ciphertext, salt, iv, authTag } = encryptPayload(rawSeed, passphrase);
			const file: IdentityFile = {
				format: IDENTITY_FORMAT_CURRENT,
				privateKeyB64: Buffer.from(ciphertext).toString("base64"),
				peerId: peerId.toString(),
				createdAt: existing.createdAt,
				salt: Buffer.from(salt).toString("base64"),
				iv: Buffer.from(iv).toString("base64"),
				authTag: Buffer.from(authTag).toString("base64"),
			};
			await writeFile(path, JSON.stringify(file, null, 2), { mode: 0o600 });
			return {
				privateKey: privateKeyFromRaw(Buffer.from(existing.privateKeyB64, "base64")),
				peerId: peerId.toString(),
				format: IDENTITY_FORMAT_CURRENT,
			};
		}
		// No passphrase: keep legacy format.
		return { privateKey, peerId: peerId.toString(), format: existing.format };
	}

	// If existing file is already encrypted format.
	if (existing && existing.format === IDENTITY_FORMAT_CURRENT) {
		if (!passphrase) {
			throw new Error("Identity file is encrypted but IDENTITY_ENCRYPTION_PASSPHRASE is not set");
		}
		const ciphertext = Buffer.from(existing.privateKeyB64, "base64");
		const salt = Buffer.from(existing.salt!, "base64");
		const iv = Buffer.from(existing.iv!, "base64");
		const authTag = Buffer.from(existing.authTag!, "base64");
		const plaintext = decryptPayload(ciphertext, passphrase, salt, iv, authTag);
		if (plaintext.length !== 64) {
			throw new Error(`identity: decrypted seed length mismatch (${plaintext.length})`);
		}
		const privateKey = privateKeyFromRaw(plaintext);
		const peerId = peerIdFromPrivateKey(privateKey);
		return { privateKey, peerId: peerId.toString(), format: IDENTITY_FORMAT_CURRENT };
	}

	// No existing identity — create new one.
	const raw = generateRawEd25519();
	const privateKey = privateKeyFromRaw(raw);
	const peerId = peerIdFromPrivateKey(privateKey);

	await mkdir(dirname(path), { recursive: true });

	if (passphrase) {
		const { ciphertext, salt, iv, authTag } = encryptPayload(raw, passphrase);
		const file: IdentityFile = {
			format: IDENTITY_FORMAT_CURRENT,
			privateKeyB64: Buffer.from(ciphertext).toString("base64"),
			peerId: peerId.toString(),
			createdAt: new Date().toISOString(),
			salt: Buffer.from(salt).toString("base64"),
			iv: Buffer.from(iv).toString("base64"),
			authTag: Buffer.from(authTag).toString("base64"),
		};
		await writeFile(path, JSON.stringify(file, null, 2), { mode: 0o600 });
		return { privateKey, peerId: peerId.toString(), format: IDENTITY_FORMAT_CURRENT };
	} else {
		// Legacy plaintext format (for backward compatibility when no passphrase)
		const file: IdentityFile = {
			format: IDENTITY_FORMAT_LEGACY,
			privateKeyB64: Buffer.from(raw).toString("base64"),
			peerId: peerId.toString(),
			createdAt: new Date().toISOString(),
		};
		await writeFile(path, JSON.stringify(file, null, 2), { mode: 0o600 });
		return { privateKey, peerId: peerId.toString(), format: IDENTITY_FORMAT_LEGACY };
	}
}
