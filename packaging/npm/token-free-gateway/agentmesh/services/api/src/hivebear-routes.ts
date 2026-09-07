import { HiveBearClient } from "@agentmesh/hivebear";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clientError, formatZodError } from "./error-shapes.js";

const MeshStartSchema = z.object({
	port: z.number().int().min(1024).max(65535).default(7878),
});

const ModelRunSchema = z.object({
	modelId: z.string().min(1).max(256),
	prompt: z.string().min(1).max(32768),
	stream: z.boolean().optional(),
});

export async function hivebearRoutes(app: FastifyInstance) {
	const client = new HiveBearClient();

	app.get("/api/hivebear/status", async (_request, reply) => {
		const status = await client.status();
		if (!status) {
			return clientError(reply, 503, "HiveBear unavailable");
		}
		return status;
	});

	app.post("/api/hivebear/mesh/start", async (request, reply) => {
		const parse = MeshStartSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}

		const ok = await client.startMesh(parse.data.port);
		if (!ok) {
			return clientError(reply, 500, "Failed to start mesh", request.id);
		}
		return { started: true, port: parse.data.port };
	});

	app.get("/api/hivebear/models", async (_request, _reply) => {
		const models = await client.searchModels("local");
		return { models };
	});

	app.post("/api/hivebear/run", async (request, reply) => {
		const parse = ModelRunSchema.safeParse(request.body);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}

		const { modelId, prompt, stream } = parse.data;
		try {
			const result = await client.runModel(modelId, prompt, { stream });
			return { output: result };
		} catch (e) {
			request.log.error({ err: e, route: "hivebear/run" }, "model run failed");
			return clientError(reply, 500, "Model run failed", request.id);
		}
	});
}
