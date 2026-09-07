/**
 * Ed25519 identity loader with forward-compatible format marker.
 *
 * Pattern source: folklore/peer-transport.ts (loadOrCreateIdentity) +
 * HiveBear/crates/hivebear-mesh/src/identity.rs (NodeIdentity) +
 * p2pclaw DID did:p2pclaw:<bs58(ed25519)>.
 *
 * Format version `ed25519-raw-v1` matches folklore's identity file format
 * and supports future migrations (the loader translates old formats on read).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { privateKeyFromRaw } from "@libp2p/crypto/keys";
import type { PrivateKey } from "@libp2p/interface";
import { peerIdFromPrivateKey } from "@libp2p/peer-id";
import { ed25519 } from "@noble/curves/ed25519";

export const IDENTITY_FORMAT_CURRENT = "ed25519-raw-v1" as const;

export interface IdentityFile {
	format: typeof IDENTITY_FORMAT_CURRENT;
	privateKeyB64: string;
	peerId: string;
	createdAt: string;
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

export async function loadOrCreateIdentity(path: string): Promise<LoadedIdentity> {
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

	if (existing && existing.format === IDENTITY_FORMAT_CURRENT) {
		const raw = Buffer.from(existing.privateKeyB64, "base64");
		if (raw.length !== 64) {
			throw new Error(`identity: expected 64 bytes, got ${raw.length}`);
		}
		const privateKey = privateKeyFromRaw(raw);
		const peerId = peerIdFromPrivateKey(privateKey);
		return { privateKey, peerId: peerId.toString(), format: existing.format };
	}

	const raw = generateRawEd25519();
	const privateKey = privateKeyFromRaw(raw);
	const peerId = peerIdFromPrivateKey(privateKey);

	await mkdir(dirname(path), { recursive: true });
	const file: IdentityFile = {
		format: IDENTITY_FORMAT_CURRENT,
		privateKeyB64: Buffer.from(raw).toString("base64"),
		peerId: peerId.toString(),
		createdAt: new Date().toISOString(),
	};
	await writeFile(path, JSON.stringify(file, null, 2), { mode: 0o600 });

	return {
		privateKey,
		peerId: peerId.toString(),
		format: IDENTITY_FORMAT_CURRENT,
	};
}
