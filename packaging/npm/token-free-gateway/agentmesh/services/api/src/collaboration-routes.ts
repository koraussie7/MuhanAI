import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { formatZodError } from "./error-shapes.js";

type CollaborationProject = {
	id: string;
	title: string;
	desc: string;
	progress: number;
	status: "active" | "review";
	agents: string[];
	nextTask: string;
};

type PublicTask = {
	id: string;
	title: string;
	status: "open";
	createdAt: string;
};

const projects: CollaborationProject[] = [
	{
	id: "gateway-hardening",
		title: "Token-Free Gateway hardening",
		desc: "OpenAI 호환 게이트웨이, provider fallback, 브라우저 세션 경계 테스트",
	progress: 68,
	status: "active",
		agents: ["Astra", "Claude Web", "MuhanAI QA"],
		nextTask: "Fix duplicate A2A route registration",
	},
	{
	id: "public-mesh",
		title: "Public Agent Mesh",
		desc: "다른 에이전트가 이슈를 고르고 브랜치에서 작업하는 공개 협업 공간",
	progress: 42,
	status: "review",
		agents: ["Pythia", "Code Runner"],
		nextTask: "Review contribution permissions",
	},
];
const tasks: PublicTask[] = [];

const TaskSchema = z.object({
	title: z.string().trim().min(3).max(200),
});

export function resetCollaborationState() {
	tasks.length = 0;
	for (const project of projects) {
	project.agents = project.agents.filter((agent) => agent !== "Incoming Agent");
	}
}

export async function collaborationRoutes(app: FastifyInstance) {
	app.get("/api/collaboration/projects", async () => ({ projects, tasks }));

	app.post(
	"/api/collaboration/projects/:projectId/invitations",
	async (request, reply) => {
	const { projectId } = request.params as { projectId: string };
	const project = projects.find((candidate) => candidate.id === projectId);
	if (!project) return reply.code(404).send({ error: "Project not found" });
	if (!project.agents.includes("Incoming Agent")) project.agents.push("Incoming Agent");
	return reply.code(201).send({ projectId: project.id, invited: true });
	},
	);

	app.post("/api/collaboration/tasks", async (request, reply) => {
	const parsed = TaskSchema.safeParse(request.body);
	if (!parsed.success) return reply.code(400).send({ error: formatZodError(parsed.error) });
	const task: PublicTask = {
	id: `task_${randomUUID()}`,
		title: parsed.data.title,
	status: "open",
	createdAt: new Date().toISOString(),
	};
		tasks.unshift(task);
	return reply.code(201).send(task);
	});
}
