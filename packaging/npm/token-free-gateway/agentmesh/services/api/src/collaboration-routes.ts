import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { formatZodError } from "./error-shapes.js";
import { createGitHubPullRequest, isGitHubPrConfigured } from "./github-pr.js";

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
	requiredSkills: string[];
};

type SkillRecord = {
	id: string;
	area: "gateway" | "agent-engineering" | "web" | "operations";
	status: "approved" | "unreviewed";
	source: "local" | "upstream";
	version: string | null;
	verification: string[];
};

const skills: SkillRecord[] = [
	{
		id: "muhanai-public-contribution",
		area: "operations",
		status: "approved",
		source: "local",
		version: "1.0.0",
		verification: ["git diff --check", "pnpm run typecheck", "pnpm test"],
	},
	{
		id: "muhanai-a2a-development",
		area: "agent-engineering",
		status: "approved",
		source: "local",
		version: "1.0.0",
		verification: ["pnpm run typecheck", "pnpm vitest run services/api/src/a2a-routes.test.ts"],
	},
	{
		id: "muhanai-provider-adapter",
		area: "gateway",
		status: "approved",
		source: "local",
		version: "1.0.0",
		verification: ["pnpm run typecheck", "pnpm test"],
	},
	{
		id: "muhanai-web-verification",
		area: "web",
		status: "approved",
		source: "local",
		version: "1.0.0",
		verification: [
			"pnpm --filter @agentmesh/web run typecheck",
			"pnpm --filter @agentmesh/web run build",
		],
	},
];

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

type CollaborationPrisma = {
	collaborationTask: {
		findMany(
			args: unknown,
		): Promise<Array<{ id: string; title: string; createdAt: Date; requiredSkills: string[] }>>;
		create(args: unknown): Promise<{ createdAt: Date }>;
	};
};

async function getPrisma(): Promise<CollaborationPrisma | null> {
	try {
		const { prisma } = await import("@agentmesh/database");
		return prisma as unknown as CollaborationPrisma;
	} catch {
		return null;
	}
}

async function listTasks(): Promise<PublicTask[]> {
	const prisma = await getPrisma();
	if (!prisma) return tasks;
	try {
		const stored = await prisma.collaborationTask.findMany({ orderBy: { createdAt: "desc" } });
		return stored.map((task) => ({
			id: task.id,
			title: task.title,
			status: "open" as const,
			createdAt: task.createdAt.toISOString(),
			requiredSkills: task.requiredSkills,
		}));
	} catch {
		return tasks;
	}
}

const TaskSchema = z.object({
	title: z.string().trim().min(3).max(200),
	requiredSkills: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
});

export function resetCollaborationState() {
	tasks.length = 0;
	for (const project of projects) {
		project.agents = project.agents.filter((agent) => agent !== "Incoming Agent");
	}
}

export async function collaborationRoutes(app: FastifyInstance) {
	app.get("/api/collaboration/projects", async () => ({
		projects,
		tasks: await listTasks(),
		skills,
	}));

	app.get("/api/collaboration/skills", async () => ({ skills }));

	app.get("/api/collaboration/integrations", async () => ({
		github: { configured: isGitHubPrConfigured() },
	}));

	app.post("/api/collaboration/projects/:projectId/invitations", async (request, reply) => {
		const { projectId } = request.params as { projectId: string };
		const project = projects.find((candidate) => candidate.id === projectId);
		if (!project) return reply.code(404).send({ error: "Project not found" });
		if (!project.agents.includes("Incoming Agent")) project.agents.push("Incoming Agent");
		return reply.code(201).send({ projectId: project.id, invited: true });
	});

	app.post("/api/collaboration/tasks", async (request, reply) => {
		const parsed = TaskSchema.safeParse(request.body);
		if (!parsed.success) return reply.code(400).send({ error: formatZodError(parsed.error) });
		const unknownSkills = parsed.data.requiredSkills.filter(
			(skillId) => !skills.some((skill) => skill.id === skillId && skill.status === "approved"),
		);
		if (unknownSkills.length > 0) {
			return reply
				.code(400)
				.send({ error: `Unknown or unapproved skills: ${unknownSkills.join(", ")}` });
		}
		const task: PublicTask = {
			id: `task_${randomUUID()}`,
			title: parsed.data.title,
			status: "open",
			createdAt: new Date().toISOString(),
			requiredSkills: parsed.data.requiredSkills,
		};
		const prisma = await getPrisma();
		if (prisma) {
			try {
				const stored = await prisma.collaborationTask.create({
					data: {
						id: task.id,
						title: task.title,
						requiredSkills: task.requiredSkills,
						skills: {
							create: task.requiredSkills.map((skillId) => ({
								skill: { connect: { id: skillId } },
							})),
						},
					},
				});
				task.createdAt = stored.createdAt.toISOString();
			} catch {
				// Development/demo mode remains usable without a reachable database.
			}
		}
		if (!prisma || tasks.every((candidate) => candidate.id !== task.id)) tasks.unshift(task);
		return reply.code(201).send(task);
	});

	app.post("/api/collaboration/tasks/:taskId/github-pr", async (request, reply) => {
		const { taskId } = request.params as { taskId: string };
		const task = (await listTasks()).find((candidate) => candidate.id === taskId);
		if (!task) return reply.code(404).send({ error: "Task not found" });
		try {
			const pullRequest = await createGitHubPullRequest({
				title: task.title,
				body: `MuhanAI public collaboration task ${task.id}. Required skills: ${task.requiredSkills.join(", ") || "none"}.`,
				headBranch: `muhanai/task-${task.id}`,
			});
			return reply.code(201).send({ taskId: task.id, pullRequest });
		} catch (error) {
			return reply
				.code(503)
				.send({ error: error instanceof Error ? error.message : "GitHub integration unavailable" });
		}
	});
}
