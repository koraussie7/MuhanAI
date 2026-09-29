import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { collaborationRoutes, resetCollaborationState } from "./collaboration-routes.js";

async function makeApp() {
	const app = Fastify();
	await app.register(collaborationRoutes);
	return app;
}

describe("collaboration routes", () => {
	afterEach(() => {
		resetCollaborationState();
	});

	it("lists public projects and tasks", async () => {
		const app = await makeApp();
		try {
			const response = await app.inject({ method: "GET", url: "/api/collaboration/projects" });
			expect(response.statusCode).toBe(200);
			expect(response.json().projects).toHaveLength(2);
			expect(response.json().tasks).toEqual([]);
		} finally {
			await app.close();
		}
	});

	it("creates a validated public task", async () => {
		const app = await makeApp();
		try {
			const invalid = await app.inject({
				method: "POST",
				url: "/api/collaboration/tasks",
				payload: { title: "x" },
			});
			expect(invalid.statusCode).toBe(400);

			const created = await app.inject({
				method: "POST",
				url: "/api/collaboration/tasks",
				payload: { title: "Add provider streaming regression test" },
			});
			expect(created.statusCode).toBe(201);
			expect(created.json()).toMatchObject({
				title: "Add provider streaming regression test",
				status: "open",
			});
		} finally {
			await app.close();
		}
	});

	it("invites an incoming agent once and rejects unknown projects", async () => {
		const app = await makeApp();
		try {
			const invited = await app.inject({
				method: "POST",
				url: "/api/collaboration/projects/gateway-hardening/invitations",
			});
			expect(invited.statusCode).toBe(201);

			const missing = await app.inject({
				method: "POST",
				url: "/api/collaboration/projects/not-found/invitations",
			});
			expect(missing.statusCode).toBe(404);
		} finally {
			await app.close();
		}
	});
});
