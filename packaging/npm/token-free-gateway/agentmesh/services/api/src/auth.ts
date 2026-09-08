import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Lightweight signed-token auth for the MuhanAI API.
 *
 * Uses HMAC-SHA256 over base64url-encoded JSON payloads — no external
 * dependency. Tokens are compact (`<payload>.<sig>`), stateless, and
 * verifiable only by this server (secret from AUTH_SECRET).
 *
 * Production note: AUTH_SECRET must be set. If it's missing we derive a
 * per-process random secret so tokens don't survive restarts — good enough
 * for local dev, never for production.
 */

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const secret = process.env.AUTH_SECRET;

if (!secret) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production");
  }
  console.warn(
    "[auth] AUTH_SECRET is not set. Using ephemeral secret — tokens will not survive restarts.",
  );
}

const resolvedSecret = secret ?? randomUUID();

function base64url(input: Buffer): string {
	return input.toString("base64url");
}

function sign(payload: string): Buffer {
 	return createHmac("sha256", resolvedSecret).update(payload).digest();
 }

function safeEqual(a: Buffer, b: Buffer): boolean {
	return a.length === b.length && timingSafeEqual(a, b);
}

export interface AuthTokenPayload {
	sub: string; // userId
	email?: string;
	name?: string;
	iat: number;
	exp: number;
}

export function createToken(user: {
	id: string;
	email?: string | null;
	name?: string | null;
}): string {
	const now = Date.now();
	const payload: AuthTokenPayload = {
		sub: user.id,
		...(user.email ? { email: user.email } : {}),
		...(user.name ? { name: user.name } : {}),
		iat: now,
		exp: now + TOKEN_TTL_MS,
	};
	const body = base64url(Buffer.from(JSON.stringify(payload)));
	const sig = base64url(sign(body));
	return `${body}.${sig}`;
}

export function verifyToken(token: string): AuthTokenPayload | null {
	try {
		const [body, sig] = token.split(".");
		if (!body || !sig) return null;

		// Verify signature first (constant time)
		const expected = sign(body);
		const provided = Buffer.from(sig, "base64url");
		if (!safeEqual(expected, provided)) return null;

		const raw = Buffer.from(body, "base64url").toString("utf8");
		const payload = JSON.parse(raw) as AuthTokenPayload;
		if (!payload.sub || typeof payload.exp !== "number") return null;
		if (payload.exp < Date.now()) return null;
		return payload;
	} catch {
		return null;
	}
}

export function extractBearer(req: {
	headers: Record<string, string | string[] | undefined>;
}): string | null {
	const header = req.headers.authorization;
	if (typeof header !== "string") return null;
	const match = /^Bearer\s+(.+)$/i.exec(header.trim());
	return match?.[1] ?? null;
}
