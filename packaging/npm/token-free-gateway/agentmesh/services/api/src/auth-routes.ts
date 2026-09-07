import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import argon2 from "argon2";
import { createToken, extractBearer, verifyToken } from "./auth.js";
import { formatZodError } from "./error-shapes.js";

const RegisterSchema = z.object({
	email: z.string().email(),
	name: z.string().min(1).max(120).optional(),
	password: z.string().min(8).max(512),
});

const LoginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(1).max(512),
});

export async function authRoutes(app: FastifyInstance) {
	async function getPrisma() {
		const { prisma } = await import("@agentmesh/db");
		return prisma;
	}

	/**
	 * Register a new user. Persists via Prisma when DATABASE_URL is available;
	 * otherwise stores in an in-memory map so the API still works in demos.
	 */
	const memoryUsers = new Map<
		string,
		{ id: string; email: string; name?: string; passwordHash: string }
	>();

	app.post("/api/auth/register", async (request, reply) => {
		const parse = RegisterSchema.safeParse(request.body);
		if (!parse.success) {
			return reply.code(400).send({ error: formatZodError(parse.error) });
		}
		const { email, name, password } = parse.data;
		const normalized = email.toLowerCase().trim();

		// In-memory + DB registration
		const userId = `usr_${randomId()}`;
		const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

		try {
			const prisma = await getPrisma();
			const existing = await prisma.user.findUnique({
				where: { email: normalized },
			});
			if (existing) {
				return reply.code(409).send({ error: "User already exists" });
			}
			const user = await prisma.user.create({
				data: {
					id: userId,
					email: normalized,
					name: name ?? null,
					passwordHash,
				},
			});
			const token = createToken(user);
			return reply.code(201).send({
				token,
				user: { id: user.id, email: user.email, name: user.name },
			});
		} catch {
			// DB unavailable — fall back to in-memory (dev/demo mode)
			if (memoryUsers.has(normalized)) {
				return reply.code(409).send({ error: "User already exists" });
			}
			memoryUsers.set(normalized, {
				id: userId,
				email: normalized,
				name,
				passwordHash,
			});
			return reply.code(201).send({
				token: createToken({ id: userId, email: normalized, name }),
				user: { id: userId, email: normalized, name },
			});
		}
	});

	app.post("/api/auth/login", async (request, reply) => {
		const parse = LoginSchema.safeParse(request.body);
		if (!parse.success) {
			return reply.code(400).send({ error: formatZodError(parse.error) });
		}
		const { email, password } = parse.data;
		const normalized = email.toLowerCase().trim();

		try {
			const prisma = await getPrisma();
			const user = await prisma.user.findUnique({
				where: { email: normalized },
			});
			if (!user || !user.passwordHash) {
				return reply.code(401).send({ error: "Invalid credentials" });
			}
			const valid = await argon2.verify(user.passwordHash, password);
			if (!valid) {
				return reply.code(401).send({ error: "Invalid credentials" });
			}
			const token = createToken(user);
			return {
				token,
				user: { id: user.id, email: user.email, name: user.name },
			};
		} catch {
			const user = memoryUsers.get(normalized);
			if (!user) {
				return reply.code(401).send({ error: "Invalid credentials" });
			}
			const valid = await argon2.verify(user.passwordHash, password);
			if (!valid) {
				return reply.code(401).send({ error: "Invalid credentials" });
			}
			return {
				token: createToken(user),
				user: { id: user.id, email: user.email, name: user.name },
			};
		}
	});

	app.get("/api/auth/me", async (request, reply) => {
		const token = extractBearer(request);
		if (!token) {
			return reply.code(401).send({ error: "Unauthorized" });
		}
		const payload = verifyToken(token);
		if (!payload) {
			return reply.code(401).send({ error: "Invalid or expired token" });
		}
		return {
			user: { id: payload.sub, email: payload.email, name: payload.name },
		};
	});
}

function randomId(): string {
	return randomBytes(12).toString("hex");
}
