/**
 * elizaOS adapter RPC bridge tests — verify the JSON-RPC 2.0 contract
 * that the elizaOS adapter client (`packages/elizaos-adapter/src/rpc.ts`)
 * depends on.
 */
import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./server.js";

// `credits.record` is the only test in this file that reaches a database, and
// this file only asserts the JSON-RPC 2.0 contract (the elizaOS adapter client
// depends on `amount` arriving as a string). Neither `pnpm test` locally nor CI
// provides a `DATABASE_URL` -- services/api/src/db.ts always builds a real
// PrismaClient, so the un-mocked call returned 500
// "Environment variable not found: DATABASE_URL". Substituting the two models
// the credit ledger uses keeps the contract assertions honest without making
// the suite depend on a postgres service.
const creditDb = vi.hoisted(() => {
	type Wallet = { id: string; userId: string; balance: bigint };
	const wallets = new Map<string, Wallet>();
	const seenIdempotencyKeys = new Set<string>();
	let seq = 0;

	const prisma = {
		creditWallet: {
			findUnique: async ({ where }: { where: { userId: string } }) =>
				wallets.get(where.userId) ?? null,
			upsert: async ({
				where,
				create,
			}: {
				where: { userId: string };
				create: { balance: bigint };
			}) => {
				if (!wallets.has(where.userId)) {
					wallets.set(where.userId, {
						id: `w${++seq}`,
						userId: where.userId,
						balance: create.balance,
					});
				}
				return wallets.get(where.userId);
			},
			update: async ({
				where,
				data,
			}: {
				where: { id: string };
				data: { balance: { increment: bigint } };
			}) => {
				const wallet = [...wallets.values()].find((w) => w.id === where.id);
				if (!wallet) throw new Error(`fake prisma: no wallet ${where.id}`);
				wallet.balance += data.balance.increment;
				return wallet;
			},
		},
		creditLedger: {
			findUnique: async ({ where }: { where: { idempotencyKey: string } }) =>
				seenIdempotencyKeys.has(where.idempotencyKey) ? { id: "existing" } : null,
			create: async ({ data }: { data: { idempotencyKey: string } }) => {
				seenIdempotencyKeys.add(data.idempotencyKey);
				return { id: `l${++seq}` };
			},
		},
		$transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
	};

	return {
		prisma,
		reset() {
			wallets.clear();
			seenIdempotencyKeys.clear();
			seq = 0;
		},
	};
});

vi.mock("./db.js", () => ({ prisma: creditDb.prisma }));

async function makeApp() {
	return buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
}

describe("elizaOS RPC bridge", () => {
	beforeEach(() => {
		process.env.DISABLE_AUTH = "true";
		creditDb.reset();
	});

	afterEach(() => {
		delete process.env.DISABLE_AUTH;
	});

	it("responds to cast.run with a JSON-RPC 2.0 result", async () => {
		const app = await makeApp();
		try {
			const res = await app.inject({
				method: "POST",
				url: "/rpc/cast.run",
				payload: {
					jsonrpc: "2.0",
					id: "test-1",
					method: "cast.run",
					params: { prompt: "What is the capital of France?", agents: ["agent-a"] },
				},
			});

			expect(res.statusCode).toBe(200);
			const body = res.json();
			expect(body.jsonrpc).toBe("2.0");
			expect(body.id).toBe("test-1");
			expect(body.result).toBeDefined();
			expect(body.result.requestId).toBeTruthy();
			expect(body.result.results).toHaveLength(1);
			expect(body.result.results[0].agentId).toBe("agent-a");
		} finally {
			await app.close();
		}
	});

	it("returns -32601 for unknown method", async () => {
		const app = await makeApp();
		try {
			const res = await app.inject({
				method: "POST",
				url: "/rpc/nonexistent.method",
				payload: { jsonrpc: "2.0", id: 1, method: "nonexistent.method", params: {} },
			});

			expect(res.statusCode).toBe(404);
			const body = res.json();
			expect(body.error.code).toBe(-32601);
		} finally {
			await app.close();
		}
	});

	it("returns -32700 for invalid JSON-RPC envelope", async () => {
		const app = await makeApp();
		try {
			const res = await app.inject({
				method: "POST",
				url: "/rpc/cast.run",
				payload: { jsonrpc: "1.0", id: 1, method: "cast.run", params: {} },
			});

			expect(res.statusCode).toBe(400);
			const body = res.json();
			expect(body.error.code).toBe(-32700);
		} finally {
			await app.close();
		}
	});

	it("returns -32600 when body method mismatches URL method", async () => {
		const app = await makeApp();
		try {
			const res = await app.inject({
				method: "POST",
				url: "/rpc/cast.run",
				payload: { jsonrpc: "2.0", id: 1, method: "reputation.get", params: {} },
			});

			expect(res.statusCode).toBe(400);
			const body = res.json();
			expect(body.error.code).toBe(-32600);
		} finally {
			await app.close();
		}
	});

	it("reputation.get returns default snapshot for unknown peer", async () => {
		const app = await makeApp();
		try {
			const res = await app.inject({
				method: "POST",
				url: "/rpc/reputation.get",
				payload: {
					jsonrpc: "2.0",
					id: "rep-1",
					method: "reputation.get",
					params: { peerId: "peer-unknown" },
				},
			});

			expect(res.statusCode).toBe(200);
			const body = res.json();
			expect(body.result.peerId).toBe("peer-unknown");
			expect(body.result.score).toBe(0.5);
		} finally {
			await app.close();
		}
	});

	it("reputation.get requires peerId", async () => {
		const app = await makeApp();
		try {
			const res = await app.inject({
				method: "POST",
				url: "/rpc/reputation.get",
				payload: { jsonrpc: "2.0", id: 1, method: "reputation.get", params: {} },
			});

			expect(res.statusCode).toBe(500);
			const body = res.json();
			expect(body.error.code).toBe(-32000);
			expect(body.error.message).toContain("peerId is required");
		} finally {
			await app.close();
		}
	});

	it("credits.record records a credit grant", async () => {
		const app = await makeApp();
		try {
			const res = await app.inject({
				method: "POST",
				url: "/rpc/credits.record",
				payload: {
					jsonrpc: "2.0",
					id: "credit-1",
					method: "credits.record",
					params: {
						amount: 100,
						reason: "contribution",
						idempotencyKey: "key-1",
						metadata: null,
					},
				},
			});

			expect(res.statusCode).toBe(200);
			const body = res.json();
			expect(body.result.amount).toBe("100");
			expect(body.result.reason).toBe("contribution");
		} finally {
			await app.close();
		}
	});

	it("pulse.broadcast returns ok for valid envelope", async () => {
		const app = await makeApp();
		try {
			const res = await app.inject({
				method: "POST",
				url: "/rpc/pulse.broadcast",
				payload: {
					jsonrpc: "2.0",
					id: 1,
					method: "pulse.broadcast",
					params: {
						envelope: {
							v: 1,
							peerId: "peer-1",
							nonce: 1,
							ts: Date.now(),
						},
					},
				},
			});

			expect(res.statusCode).toBe(200);
			const body = res.json();
			expect(body.result.ok).toBe(true);
		} finally {
			await app.close();
		}
	});

	it("pulse.broadcast requires envelope.peerId", async () => {
		const app = await makeApp();
		try {
			const res = await app.inject({
				method: "POST",
				url: "/rpc/pulse.broadcast",
				payload: {
					jsonrpc: "2.0",
					id: 1,
					method: "pulse.broadcast",
					params: { envelope: { v: 1, nonce: 1, ts: Date.now() } },
				},
			});

			expect(res.statusCode).toBe(500);
			const body = res.json();
			expect(body.error.code).toBe(-32000);
			expect(body.error.message).toContain("peerId is required");
		} finally {
			await app.close();
		}
	});
});
