/**
 * Agent list routes for bot.muhanai.com.
 *
 * Mutable per-user lists (shopping / todo / custom) that humans edit in the
 * web UI and agents read or write through the MCP tool surface
 * (`packages/mcp/src/lystbot-tool.ts`).
 *
 * Design notes:
 *   - Every query is scoped by `userId` so a list is never readable or
 *     writable through another account's id.
 *   - Share codes are short, random, revocable, and optionally expiring.
 *     Reading through a share code is the only cross-user read path and it
 *     returns a read-only projection.
 *   - Errors go through `clientError` so no stack traces or Prisma internals
 *     reach the client.
 */

import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { verifyToken } from "./auth.js";
import { prisma } from "./db.js";
import { clientError } from "./error-shapes.js";

const LIST_TYPES = new Set(["shopping", "todo", "custom"]);
const MAX_NAME_LENGTH = 120;
const MAX_ITEMS_PER_LIST = 500;
const SHARE_CODE_BYTES = 9;

/** Owner id used only when auth is explicitly disabled outside production. */
const DEV_OWNER_ID = "local-dev-owner";

interface ListOwner {
	userId: string;
}

/**
 * Resolve the acting user from a verified session token.
 *
 * The owner id is read from the `sub` claim of the HMAC-signed
 * `Authorization: Bearer <token>`, which `auth.ts` validates against
 * `AUTH_SECRET` before we trust the claim. A caller therefore cannot claim
 * another account by setting a header.
 *
 * A pre-authenticated `request.user` object is also honoured so a future
 * session middleware can own identity resolution instead of this function.
 *
 * The dev fallback only applies when auth is disabled outside production; the
 * server refuses to start in production without `AUTH_SECRET`, so that branch
 * is unreachable there.
 */
function resolveOwner(request: FastifyRequest, isAuthDisabled: boolean): ListOwner | null {
	const rawAuth = request.headers.authorization;
	const bearer =
		typeof rawAuth === "string"
			? (/^Bearer\s+(.+)$/i.exec(rawAuth.trim())?.[1]?.trim() ?? null)
			: null;
	if (bearer) {
		const payload = verifyToken(bearer);
		return payload?.sub ? { userId: payload.sub } : null;
	}

	// `request.user` is not declared on FastifyRequest, so read it through a
	// narrow cast. A future session decorator can set it without changing this.
	const preAuthed = (request as { user?: unknown }).user;
	if (preAuthed && typeof preAuthed === "object") {
		const candidate = preAuthed as { userId?: unknown; sub?: unknown; id?: unknown };
		const userId = candidate.userId ?? candidate.sub ?? candidate.id;
		if (typeof userId === "string" && userId.trim() !== "") {
			return { userId: userId.trim() };
		}
	}

	return isAuthDisabled ? { userId: DEV_OWNER_ID } : null;
}

function isValidShareCode(code: string): boolean {
	return /^[A-Za-z0-9_-]{8,32}$/.test(code);
}

function toListResponse(list: {
	id: string;
	name: string;
	listType: string;
	description: string | null;
	createdAt: Date;
	updatedAt: Date;
	items: Array<{
		id: string;
		name: string;
		quantity: number | null;
		note: string | null;
		done: boolean;
		position: number;
		createdAt: Date;
		updatedAt: Date;
	}>;
}) {
	return {
		id: list.id,
		name: list.name,
		listType: list.listType,
		description: list.description,
		items: list.items.map((item) => ({
			id: item.id,
			name: item.name,
			quantity: item.quantity,
			note: item.note,
			done: item.done,
			position: item.position,
			createdAt: item.createdAt.toISOString(),
			updatedAt: item.updatedAt.toISOString(),
		})),
		itemCount: list.items.length,
		openCount: list.items.filter((item) => !item.done).length,
		createdAt: list.createdAt.toISOString(),
		updatedAt: list.updatedAt.toISOString(),
	};
}

const listInclude: Prisma.AgentListInclude = {
	items: { orderBy: [{ done: "asc" }, { position: "asc" }, { createdAt: "asc" }] },
};

export async function listRoutes(app: FastifyInstance) {
	// Matches the server's auth gate: DISABLE_AUTH is honored only outside
	// production, so the dev owner fallback is unreachable in production.
	const isAuthDisabled =
		process.env.DISABLE_AUTH === "true" && process.env.NODE_ENV !== "production";

	app.get("/api/lists", async (request, reply) => {
		const owner = resolveOwner(request, isAuthDisabled);
		if (!owner) return clientError(reply, 401, "authentication required", request.id);

		const query = request.query as { type?: string; limit?: string };
		const type = typeof query.type === "string" ? query.type : undefined;
		if (type && !LIST_TYPES.has(type)) {
			return clientError(reply, 400, "type: must be shopping, todo, or custom", request.id);
		}
		const limit = Math.min(Math.max(Number(query.limit ?? 50) || 50, 1), 200);

		const lists = await prisma.agentList.findMany({
			where: { userId: owner.userId, ...(type ? { listType: type } : {}) },
			include: listInclude,
			orderBy: { updatedAt: "desc" },
			take: limit,
		});
		return { lists: lists.map(toListResponse) };
	});

	app.post("/api/lists", async (request, reply) => {
		const owner = resolveOwner(request, isAuthDisabled);
		if (!owner) return clientError(reply, 401, "authentication required", request.id);

		const body = (request.body ?? {}) as {
			name?: unknown;
			listType?: unknown;
			description?: unknown;
		};
		const name = typeof body.name === "string" ? body.name.trim() : "";
		if (!name) return clientError(reply, 400, "name: required", request.id);
		if (name.length > MAX_NAME_LENGTH) {
			return clientError(
				reply,
				400,
				`name: must be at most ${MAX_NAME_LENGTH} characters`,
				request.id,
			);
		}
		const listType = typeof body.listType === "string" ? body.listType : "custom";
		if (!LIST_TYPES.has(listType)) {
			return clientError(reply, 400, "listType: must be shopping, todo, or custom", request.id);
		}
		const description =
			typeof body.description === "string" && body.description.trim() !== ""
				? body.description.trim().slice(0, 500)
				: null;

		const list = await prisma.agentList.create({
			data: { userId: owner.userId, name, listType, description },
			include: listInclude,
		});
		return reply.code(201).send(toListResponse(list));
	});

	app.get("/api/lists/:id", async (request, reply) => {
		const owner = resolveOwner(request, isAuthDisabled);
		if (!owner) return clientError(reply, 401, "authentication required", request.id);
		const { id } = request.params as { id: string };

		const list = await prisma.agentList.findFirst({
			where: { id, userId: owner.userId },
			include: listInclude,
		});
		if (!list) return clientError(reply, 404, "list not found", request.id);
		return toListResponse(list);
	});

	app.patch("/api/lists/:id", async (request, reply) => {
		const owner = resolveOwner(request, isAuthDisabled);
		if (!owner) return clientError(reply, 401, "authentication required", request.id);
		const { id } = request.params as { id: string };

		const body = (request.body ?? {}) as {
			name?: unknown;
			listType?: unknown;
			description?: unknown;
		};
		const data: Record<string, unknown> = {};
		if (typeof body.name === "string") {
			const name = body.name.trim();
			if (!name) return clientError(reply, 400, "name: must not be empty", request.id);
			if (name.length > MAX_NAME_LENGTH) {
				return clientError(
					reply,
					400,
					`name: must be at most ${MAX_NAME_LENGTH} characters`,
					request.id,
				);
			}
			data.name = name;
		}
		if (typeof body.listType === "string") {
			if (!LIST_TYPES.has(body.listType)) {
				return clientError(reply, 400, "listType: must be shopping, todo, or custom", request.id);
			}
			data.listType = body.listType;
		}
		if (typeof body.description === "string") {
			data.description =
				body.description.trim() === "" ? null : body.description.trim().slice(0, 500);
		}
		if (Object.keys(data).length === 0) {
			return clientError(reply, 400, "no updatable fields supplied", request.id);
		}

		const existing = await prisma.agentList.findFirst({ where: { id, userId: owner.userId } });
		if (!existing) return clientError(reply, 404, "list not found", request.id);

		const list = await prisma.agentList.update({
			where: { id },
			data: data as never,
			include: listInclude,
		});
		return toListResponse(list);
	});

	app.delete("/api/lists/:id", async (request, reply) => {
		const owner = resolveOwner(request, isAuthDisabled);
		if (!owner) return clientError(reply, 401, "authentication required", request.id);
		const { id } = request.params as { id: string };

		const existing = await prisma.agentList.findFirst({ where: { id, userId: owner.userId } });
		if (!existing) return clientError(reply, 404, "list not found", request.id);
		await prisma.agentList.delete({ where: { id } });
		return reply.code(204).send();
	});

	app.post("/api/lists/:id/items", async (request, reply) => {
		const owner = resolveOwner(request, isAuthDisabled);
		if (!owner) return clientError(reply, 401, "authentication required", request.id);
		const { id } = request.params as { id: string };

		const body = (request.body ?? {}) as { name?: unknown; quantity?: unknown; note?: unknown };
		const name = typeof body.name === "string" ? body.name.trim() : "";
		if (!name) return clientError(reply, 400, "name: required", request.id);
		if (name.length > MAX_NAME_LENGTH) {
			return clientError(
				reply,
				400,
				`name: must be at most ${MAX_NAME_LENGTH} characters`,
				request.id,
			);
		}

		const list = await prisma.agentList.findFirst({ where: { id, userId: owner.userId } });
		if (!list) return clientError(reply, 404, "list not found", request.id);

		const count = await prisma.agentListItem.count({ where: { listId: id } });
		if (count >= MAX_ITEMS_PER_LIST) {
			return clientError(reply, 409, `list is limited to ${MAX_ITEMS_PER_LIST} items`, request.id);
		}

		const item = await prisma.agentListItem.create({
			data: {
				listId: id,
				name,
				...(typeof body.quantity === "number" && Number.isFinite(body.quantity)
					? { quantity: body.quantity }
					: {}),
				...(typeof body.note === "string" && body.note.trim() !== ""
					? { note: body.note.trim().slice(0, 500) }
					: {}),
				position: count,
			},
		});
		await prisma.agentList.update({ where: { id }, data: { updatedAt: new Date() } });
		return reply.code(201).send({
			id: item.id,
			listId: item.listId,
			name: item.name,
			quantity: item.quantity,
			note: item.note,
			done: item.done,
			position: item.position,
			createdAt: item.createdAt.toISOString(),
			updatedAt: item.updatedAt.toISOString(),
		});
	});

	app.patch("/api/lists/:id/items/:itemId", async (request, reply) => {
		const owner = resolveOwner(request, isAuthDisabled);
		if (!owner) return clientError(reply, 401, "authentication required", request.id);
		const { id, itemId } = request.params as { id: string; itemId: string };

		const item = await prisma.agentListItem.findFirst({ where: { id: itemId, listId: id } });
		if (!item) return clientError(reply, 404, "item not found", request.id);
		const list = await prisma.agentList.findFirst({ where: { id, userId: owner.userId } });
		if (!list) return clientError(reply, 404, "list not found", request.id);

		const body = (request.body ?? {}) as {
			name?: unknown;
			done?: unknown;
			quantity?: unknown;
			note?: unknown;
		};
		const data: Record<string, unknown> = {};
		if (typeof body.name === "string" && body.name.trim() !== "") data.name = body.name.trim();
		if (typeof body.done === "boolean") data.done = body.done;
		if (typeof body.quantity === "number" && Number.isFinite(body.quantity))
			data.quantity = body.quantity;
		if (typeof body.note === "string") {
			data.note = body.note.trim() === "" ? null : body.note.trim().slice(0, 500);
		}
		if (Object.keys(data).length === 0) {
			return clientError(reply, 400, "no updatable fields supplied", request.id);
		}

		const updated = await prisma.agentListItem.update({
			where: { id: itemId },
			data: data as never,
		});
		await prisma.agentList.update({ where: { id }, data: { updatedAt: new Date() } });
		return {
			id: updated.id,
			listId: updated.listId,
			name: updated.name,
			quantity: updated.quantity,
			note: updated.note,
			done: updated.done,
			position: updated.position,
			createdAt: updated.createdAt.toISOString(),
			updatedAt: updated.updatedAt.toISOString(),
		};
	});

	app.delete("/api/lists/:id/items/:itemId", async (request, reply) => {
		const owner = resolveOwner(request, isAuthDisabled);
		if (!owner) return clientError(reply, 401, "authentication required", request.id);
		const { id, itemId } = request.params as { id: string; itemId: string };

		const item = await prisma.agentListItem.findFirst({ where: { id: itemId, listId: id } });
		if (!item) return clientError(reply, 404, "item not found", request.id);
		const list = await prisma.agentList.findFirst({ where: { id, userId: owner.userId } });
		if (!list) return clientError(reply, 404, "list not found", request.id);

		await prisma.agentListItem.delete({ where: { id: itemId } });
		await prisma.agentList.update({ where: { id }, data: { updatedAt: new Date() } });
		return reply.code(204).send();
	});

	app.post("/api/lists/:id/shares", async (request, reply) => {
		const owner = resolveOwner(request, isAuthDisabled);
		if (!owner) return clientError(reply, 401, "authentication required", request.id);
		const { id } = request.params as { id: string };

		const list = await prisma.agentList.findFirst({ where: { id, userId: owner.userId } });
		if (!list) return clientError(reply, 404, "list not found", request.id);

		const body = (request.body ?? {}) as { expiresInHours?: unknown };
		const hours =
			typeof body.expiresInHours === "number" && Number.isFinite(body.expiresInHours)
				? Math.min(Math.max(body.expiresInHours, 1), 24 * 90)
				: null;

		const code = randomBytes(SHARE_CODE_BYTES).toString("base64url");
		const share = await prisma.agentListShare.create({
			data: {
				listId: id,
				code,
				ownerId: owner.userId,
				...(hours ? { expiresAt: new Date(Date.now() + hours * 3_600_000) } : {}),
			},
		});
		return reply.code(201).send({
			id: share.id,
			code: share.code,
			listId: share.listId,
			expiresAt: share.expiresAt?.toISOString() ?? null,
			createdAt: share.createdAt.toISOString(),
		});
	});

	app.get("/api/lists/shared/:code", async (request, reply) => {
		const { code } = request.params as { code: string };
		if (!isValidShareCode(code)) {
			return clientError(reply, 400, "invalid share code", request.id);
		}

		const share = await prisma.agentListShare.findUnique({ where: { code } });
		if (!share) return clientError(reply, 404, "share not found", request.id);
		if (share.revokedAt) return clientError(reply, 410, "share was revoked", request.id);
		if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
			return clientError(reply, 410, "share expired", request.id);
		}

		const list = await prisma.agentList.findUnique({
			where: { id: share.listId },
			include: listInclude,
		});
		if (!list) return clientError(reply, 404, "shared list not found", request.id);
		// Read-only projection: no owner id, no share metadata.
		return { list: toListResponse(list), readOnly: true };
	});

	app.delete("/api/lists/:id/shares/:shareId", async (request, reply) => {
		const owner = resolveOwner(request, isAuthDisabled);
		if (!owner) return clientError(reply, 401, "authentication required", request.id);
		const { id, shareId } = request.params as { id: string; shareId: string };

		const share = await prisma.agentListShare.findFirst({
			where: { id: shareId, listId: id, ownerId: owner.userId },
		});
		if (!share) return clientError(reply, 404, "share not found", request.id);
		await prisma.agentListShare.update({
			where: { id: shareId },
			data: { revokedAt: new Date() },
		});
		return reply.code(204).send();
	});
}
