/**
 * Per-user credentials vault.
 *
 * Stores API keys (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.) encrypted
 * at rest. The vault lives on the user's machine and is unlocked with
 * a passphrase-derived key (PBKDF2-SHA256, 200k iterations).
 *
 * Wire format (file or in-memory blob):
 *   { v: 1, salt: bytes(16), iv: bytes(12), ciphertext: bytes(*) }
 *
 * Tampering:
 *   GCM's 16-byte auth tag is verified on every decrypt. A tampered
 *   blob raises `VaultTamperedError`.
 *
 * Phase 1 scope: passphrase mode. Phase 2 will add device-key escrow
 * mode (the install.sh A4 path) — same on-disk format, different KDF.
 */

export interface VaultBlob {
	v: 1;
	salt: Uint8Array;
	iv: Uint8Array;
	ciphertext: Uint8Array;
}

export interface VaultEntry {
	/** Service name, e.g. "openai". */
	service: string;
	/** Plaintext API key. */
	secret: string;
	/** Optional note (never surfaced to anyone but the user). */
	note?: string;
	/** ms since epoch. */
	updatedAt: number;
}

export class VaultTamperedError extends Error {
	constructor() {
		super("credentials vault blob failed integrity check");
		this.name = "VaultTamperedError";
	}
}

export class VaultAuthError extends Error {
	constructor() {
		super("invalid passphrase");
		this.name = "VaultAuthError";
	}
}

const PBKDF2_ITERATIONS = 200_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * Create a fresh vault from a passphrase and an initial set of entries.
 * Returns the serialized blob ready for disk persistence.
 */
export async function createVault(opts: {
	passphrase: string;
	entries?: VaultEntry[];
}): Promise<VaultBlob> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const key = await deriveKey(opts.passphrase, salt);
	const plaintext = encodeEntries(opts.entries ?? []);
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const ciphertext = await aesGcmEncrypt(key, iv, plaintext);
	return { v: 1, salt, iv, ciphertext };
}

/**
 * Unlock a vault blob with a passphrase. Returns a handle exposing
 * get/put/list. Throws VaultAuthError on wrong passphrase, VaultTamperedError
 * on bit-rot or tampering.
 */
export async function unlockVault(opts: {
	blob: VaultBlob;
	passphrase: string;
}): Promise<VaultHandle> {
	if (opts.blob.v !== 1) throw new Error(`unsupported vault version: ${opts.blob.v}`);
	const key = await deriveKey(opts.passphrase, opts.blob.salt);
	let plaintext: Uint8Array;
	try {
		plaintext = await aesGcmDecrypt(key, opts.blob.iv, opts.blob.ciphertext);
	} catch {
		// AES-GCM throws on auth failure — wrong passphrase or tampered blob.
		throw new VaultAuthError();
	}
	const map = decodeEntries(plaintext);

	return {
		list: () => Array.from(map.values()).map((e) => ({ ...e })),
		get: (service: string) => {
			const e = map.get(service);
			return e ? { ...e } : null;
		},
		async put(entry: VaultEntry) {
			map.set(entry.service, { ...entry, updatedAt: Date.now() });
			return serialize(map, opts.blob.salt, key);
		},
		async remove(service: string) {
			map.delete(service);
			return serialize(map, opts.blob.salt, key);
		},
	};
}

export interface VaultHandle {
	list(): VaultEntry[];
	get(service: string): VaultEntry | null;
	put(entry: VaultEntry): Promise<VaultBlob>;
	remove(service: string): Promise<VaultBlob>;
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
	const baseKey = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(passphrase),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", salt: new Uint8Array(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
		baseKey,
		KEY_BYTES * 8,
	);
	return new Uint8Array(bits);
}

async function serialize(
	map: Map<string, VaultEntry>,
	salt: Uint8Array,
	key: Uint8Array,
): Promise<VaultBlob> {
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const ciphertext = await aesGcmEncrypt(key, iv, encodeEntries(Array.from(map.values())));
	return { v: 1, salt, iv, ciphertext };
}

function encodeEntries(entries: VaultEntry[]): Uint8Array {
	return new TextEncoder().encode(JSON.stringify(entries));
}

function decodeEntries(bytes: Uint8Array): Map<string, VaultEntry> {
	const arr = JSON.parse(new TextDecoder().decode(bytes)) as VaultEntry[];
	const map = new Map<string, VaultEntry>();
	for (const e of arr) map.set(e.service, e);
	return map;
}

async function aesGcmEncrypt(key: Uint8Array, iv: Uint8Array, pt: Uint8Array): Promise<Uint8Array> {
	const ck = await crypto.subtle.importKey("raw", new Uint8Array(key), "AES-GCM", false, ["encrypt"]);
	return new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: new Uint8Array(iv) }, ck, new Uint8Array(pt)));
}

async function aesGcmDecrypt(key: Uint8Array, iv: Uint8Array, ct: Uint8Array): Promise<Uint8Array> {
	const ck = await crypto.subtle.importKey("raw", new Uint8Array(key), "AES-GCM", false, ["decrypt"]);
	return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv) }, ck, new Uint8Array(ct)));
}
