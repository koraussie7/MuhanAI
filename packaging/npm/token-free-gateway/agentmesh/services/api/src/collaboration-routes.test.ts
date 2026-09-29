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
			const body = response.json();
			expect(body.projects).toHaveLength(2);
			expect(body.tasks).toEqual([]);
			expect(body.skills.map((skill: { id: string }) => skill.id)).toContain("muhanai-a2a-development");
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
				payload: {
		title: "Add provider streaming regression test",
		requiredSkills: ["muhanai-provider-adapter"],
	},
			});
			expect(created.statusCode).toBe(201);
					expect(created.json()).toMatchObject({
				title: "Add provider streaming regression test",
			status: "open",
				requiredSkills: ["muhanai-provider-adapter"],
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
