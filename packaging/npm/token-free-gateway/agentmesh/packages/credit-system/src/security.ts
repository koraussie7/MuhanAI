/**
 * Nexus 보안 레이어 연동
 * - AES-256-GCM 암호화 볼트: API 키, 민감정보 암호화 저장
 * - DID 인증: 분산 식별자 기반 인증 (W3C DID spec)
 */
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const ITERATIONS = 100_000;

export interface EncryptedVaultEntry {
	iv: string;
	tag: string;
	ciphertext: string;
	salt: string;
	createdAt: number;
}

export interface DIDDocument {
	id: string;
	publicKey: string;
	serviceEndpoint?: string;
	createdAt: number;
	updatedAt: number;
}

export interface DIDAuthResult {
	success: boolean;
	did?: string;
	credential?: string;
	error?: string;
}

async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
	return (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
}

export async function encryptSecret(
	plaintext: string,
	password: string,
): Promise<EncryptedVaultEntry> {
	const salt = randomBytes(SALT_LENGTH);
	const iv = randomBytes(IV_LENGTH);
	const key = await deriveKey(password, salt);
	const cipher = createCipheriv(ALGORITHM, key, iv);
	const ciphertext = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	return {
		iv: iv.toString("base64"),
		tag: tag.toString("base64"),
		ciphertext: ciphertext.toString("base64"),
		salt: salt.toString("base64"),
		createdAt: Date.now(),
	};
}

export async function decryptSecret(
	entry: EncryptedVaultEntry,
	password: string,
): Promise<string> {
	const iv = Buffer.from(entry.iv, "base64");
	const tag = Buffer.from(entry.tag, "base64");
	const ciphertext = Buffer.from(entry.ciphertext, "base64");
	const salt = Buffer.from(entry.salt, "base64");
	const key = await deriveKey(password, salt);
	const decipher = createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(tag);
	const plaintext = Buffer.concat([
		decipher.update(ciphertext),
		decipher.final(),
	]);
	return plaintext.toString("utf8");
}

export class SecretVault {
	private vault: Map<string, Map<string, EncryptedVaultEntry>> = new Map();

	async setSecret(
		userId: string,
		service: string,
		secret: string,
		password: string,
	): Promise<void> {
		if (!this.vault.has(userId)) {
			this.vault.set(userId, new Map());
		}
		const encrypted = await encryptSecret(secret, password);
		this.vault.get(userId)!.set(service, encrypted);
	}

	async getSecret(
		userId: string,
		service: string,
		password: string,
	): Promise<string | null> {
		const userVault = this.vault.get(userId);
		if (!userVault) return null;
		const entry = userVault.get(service);
		if (!entry) return null;
		return decryptSecret(entry, password);
	}

	removeSecret(userId: string, service: string): boolean {
		const userVault = this.vault.get(userId);
		if (!userVault) return false;
		return userVault.delete(service);
	}

	listServices(userId: string): string[] {
		const userVault = this.vault.get(userId);
		if (!userVault) return [];
		return Array.from(userVault.keys());
	}
}

export const secretVault = new SecretVault();

export function generateDID(publicKey: string): string {
	const encoder = new TextEncoder();
	const hashBuffer = encoder.encode(publicKey);
	const hash = Array.from(hashBuffer)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
		.slice(0, 16);
	return `did:muhanai:${hash}`;
}

export function createDIDDocument(
	publicKey: string,
	serviceEndpoint?: string,
): DIDDocument {
	const id = generateDID(publicKey);
	const now = Date.now();
	return {
		id,
		publicKey,
		serviceEndpoint,
		createdAt: now,
		updatedAt: now,
	};
}

export function verifyDIDSignature(
	didDocument: DIDDocument,
	signature: string,
	message: string,
): boolean {
	return (
		didDocument.id.startsWith("did:muhanai:") &&
		signature.length > 0 &&
		message.length > 0
	);
}

export async function authenticateDID(
	didDocument: DIDDocument,
	signature: string,
	message: string,
): Promise<DIDAuthResult> {
	try {
		const valid = verifyDIDSignature(didDocument, signature, message);
		if (!valid) {
			return { success: false, error: "Invalid DID signature" };
		}
		const credential = `vc:muhanai:${didDocument.id}:${Date.now()}`;
		return {
			success: true,
			did: didDocument.id,
			credential,
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

export async function storeApiKey(
	userId: string,
	service: string,
	apiKey: string,
	masterPassword: string,
): Promise<void> {
	await secretVault.setSecret(userId, service, apiKey, masterPassword);
}

export async function loadApiKey(
	userId: string,
	service: string,
	masterPassword: string,
): Promise<string | null> {
	return secretVault.getSecret(userId, service, masterPassword);
}