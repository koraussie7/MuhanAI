/**
 * A2A Routes Tests
 */

import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import a2aRoutes, { clearTestStores, createTestAgentCard, createTestTask } from "./a2a-routes.js";

describe("A2A Routes", () => {
	let app: ReturnType<typeof Fastify>;

	beforeEach(async () => {
		app = Fastify();
		await app.register(a2aRoutes);
		await app.ready();
		clearTestStores();
	});

	afterEach(async () => {
		await app.close();
	});

	describe("GET /.well-known/agent.json", () => {
		test("returns 503 when registry not configured", async () => {
			const res = await app.inject({ method: "GET", url: "/.well-known/agent.json" });
			expect(res.statusCode).toBe(503);
			expect(JSON.parse(res.payload)).toEqual({
				error: "service_unavailable",
				message: "Agent registry not configured",
			});
		});
	});

	describe("POST /a2a/rpc", () => {
		test("returns 400 for invalid JSON-RPC", async () => {
			const res = await app.inject({
				method: "POST",
				url: "/a2a/rpc",
				payload: { jsonrpc: "2.0", id: 1 },
			});
			expect(res.statusCode).toBe(400);
			const body = JSON.parse(res.payload);
			expect(body.error.code).toBe(-32600);
		});

		test("returns 404 for unknown method", async () => {
			const res = await app.inject({
				method: "POST",
				url: "/a2a/rpc",
				payload: { jsonrpc: "2.0", id: 1, method: "unknown/method" },
			});
			expect(res.statusCode).toBe(404);
			const body = JSON.parse(res.payload);
			expect(body.error.code).toBe(-32601);
		});

		test("tasks/send creates task and returns it", async () => {
			const res = await app.inject({
				method: "POST",
				url: "/a2a/rpc",
				payload: {
					jsonrpc: "2.0",
					id: 1,
					method: "tasks/send",
					params: {
						id: "test-task-1",
						message: { role: "user", parts: [{ type: "text", text: "hello" }] },
					},
				},
			});
			expect(res.statusCode).toBe(200);
			const body = JSON.parse(res.payload);
			expect(body.result.id).toBe("test-task-1");
			expect(body.result.status.state).toBe("submitted");
		});

		test("tasks/get returns task by id", async () => {
			// First create a task
			await app.inject({
				method: "POST",
				url: "/a2a/rpc",
				payload: {
					jsonrpc: "2.0",
					id: 1,
					method: "tasks/send",
					params: {
						id: "test-task-2",
						message: { role: "user", parts: [{ type: "text", text: "hello" }] },
					},
				},
			});

			const res = await app.inject({
				method: "POST",
				url: "/a2a/rpc",
				payload: {
					jsonrpc: "2.0",
					id: 2,
					method: "tasks/get",
					params: { id: "test-task-2" },
				},
			});
			expect(res.statusCode).toBe(200);
			const body = JSON.parse(res.payload);
			expect(body.result.id).toBe("test-task-2");
		});

		test("tasks/get returns 404 for non-existent task", async () => {
			const res = await app.inject({
				method: "POST",
				url: "/a2a/rpc",
				payload: {
					jsonrpc: "2.0",
					id: 1,
					method: "tasks/get",
					params: { id: "non-existent" },
				},
			});
			expect(res.statusCode).toBe(404);
			const body = JSON.parse(res.payload);
			expect(body.error.code).toBe(-32601);
		});

		test("tasks/cancel cancels a task", async () => {
			await app.inject({
				method: "POST",
				url: "/a2a/rpc",
				payload: {
					jsonrpc: "2.0",
					id: 1,
					method: "tasks/send",
					params: {
						id: "test-task-3",
						message: { role: "user", parts: [{ type: "text", text: "hello" }] },
					},
				},
			});

			const res = await app.inject({
				method: "POST",
				url: "/a2a/rpc",
				payload: {
					jsonrpc: "2.0",
					id: 2,
					method: "tasks/cancel",
					params: { id: "test-task-3" },
				},
			});
			expect(res.statusCode).toBe(200);
			const body = JSON.parse(res.payload);
			expect(body.result.status.state).toBe("canceled");
		});

		test("pushNotification set/get works", async () => {
			const res = await app.inject({
				method: "POST",
				url: "/a2a/rpc",
				payload: {
					jsonrpc: "2.0",
					id: 1,
					method: "tasks/pushNotification/set",
					params: {
						taskId: "test-task-4",
						config: { url: "http://example.com/webhook", token: "secret" },
					},
				},
			});
			expect(res.statusCode).toBe(200);

			const getRes = await app.inject({
				method: "POST",
				url: "/a2a/rpc",
				payload: {
					jsonrpc: "2.0",
					id: 2,
					method: "tasks/pushNotification/get",
					params: { taskId: "test-task-4" },
				},
			});
			expect(getRes.statusCode).toBe(200);
			const body = JSON.parse(getRes.payload);
			expect(body.result.url).toBe("http://example.com/webhook");
			expect(body.result.token).toBe("secret");
		});
	});

	describe("REST convenience endpoints", () => {
		test("POST /a2a/tasks/send", async () => {
			const res = await app.inject({
				method: "POST",
				url: "/a2a/tasks/send",
				payload: {
					id: "rest-task-1",
					message: { role: "user", parts: [{ type: "text", text: "hello via REST" }] },
				},
			});
			expect(res.statusCode).toBe(200);
			const body = JSON.parse(res.payload);
			expect(body.result.id).toBe("rest-task-1");
		});

		test("POST /a2a/tasks/get", async () => {
			await app.inject({
				method: "POST",
				url: "/a2a/tasks/send",
				payload: {
					id: "rest-task-2",
					message: { role: "user", parts: [{ type: "text", text: "hello" }] },
				},
			});

			const res = await app.inject({
				method: "POST",
				url: "/a2a/tasks/get",
				payload: { id: "rest-task-2" },
			});
			expect(res.statusCode).toBe(200);
			const body = JSON.parse(res.payload);
			expect(body.result.id).toBe("rest-task-2");
		});

		test("POST /a2a/tasks/cancel", async () => {
			await app.inject({
				method: "POST",
				url: "/a2a/tasks/send",
				payload: {
					id: "rest-task-3",
					message: { role: "user", parts: [{ type: "text", text: "hello" }] },
				},
			});

			const res = await app.inject({
				method: "POST",
				url: "/a2a/tasks/cancel",
				payload: { id: "rest-task-3" },
			});
			expect(res.statusCode).toBe(200);
			const body = JSON.parse(res.payload);
			expect(body.result.status.state).toBe("canceled");
		});
	});
});

describe("Test utilities", () => {
	afterEach(() => {
		clearTestStores();
	});

	test("createTestAgentCard returns valid card", () => {
		const card = createTestAgentCard({ name: "Custom" });
		expect(card.name).toBe("Custom");
		expect(card.skills).toHaveLength(1);
		expect(card.skills[0]?.id).toBe("echo");
	});

	test("createTestTask creates valid task", () => {
		const task = createTestTask({ id: "custom-id" });
		expect(task.id).toBe("custom-id");
		expect(task.status.state).toBe("submitted");
	});
});
