import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { formatZodError } from "./error-shapes.js";

export async function feedRoutes(app: FastifyInstance) {
	async function getPrisma() {
		const { prisma } = await import("@agentmesh/database");
		return prisma;
	}

	// ===========================================================================
	// Help Needed
	// ===========================================================================

	const HelpAnswerSchema = z.object({
		content: z.string().min(1).max(5000),
	});

	app.get("/api/help-needed", async (_request, reply) => {
		try {
			const prisma = await getPrisma();
			const items = await prisma.helpNeeded.findMany({
				where: { status: "open" },
				orderBy: { createdAt: "desc" },
				take: 50,
			});
			return items;
		} catch {
			return reply.code(503).send({ error: "Database unavailable" });
		}
	});

	app.post("/api/help-needed/:id/answer", async (request, reply) => {
		const parse = HelpAnswerSchema.safeParse(request.body);
		if (!parse.success) {
			return reply.code(400).send({ error: formatZodError(parse.error) });
		}

		const { id } = request.params as { id: string };
		const { content } = parse.data;

		try {
			const prisma = await getPrisma();

			const answer = await prisma.helpAnswer.create({
				data: {
					helpNeededId: id,
					content,
				},
			});

			await prisma.helpNeeded.update({
				where: { id },
				data: { humanAnswers: { increment: 1 } },
			});

			return reply.code(201).send(answer);
		} catch {
			return reply.code(503).send({ error: "Database unavailable" });
		}
	});

	// ===========================================================================
	// Verify Items
	// ===========================================================================

	const VoteSchema = z.object({
		vote: z.enum(["correct", "wrong", "unsure"]),
	});

	app.get("/api/verify", async (_request, reply) => {
		try {
			const prisma = await getPrisma();
			const items = await prisma.verifyItem.findMany({
				where: { status: "pending" },
				orderBy: { createdAt: "desc" },
				take: 50,
			});
			return items;
		} catch {
			return reply.code(503).send({ error: "Database unavailable" });
		}
	});

	app.post("/api/verify/:id/vote", async (request, reply) => {
		const parse = VoteSchema.safeParse(request.body);
		if (!parse.success) {
			return reply.code(400).send({ error: formatZodError(parse.error) });
		}

		const { id } = request.params as { id: string };
		const { vote } = parse.data;

		try {
			const prisma = await getPrisma();

			const field = vote === "correct" ? "correct" : vote === "wrong" ? "wrong" : "unsure";

			const updated = await prisma.verifyItem.update({
				where: { id },
				data: { [field]: { increment: 1 } },
			});

			return updated;
		} catch {
			return reply.code(503).send({ error: "Database unavailable" });
		}
	});

	// ===========================================================================
	// Human Wanted
	// ===========================================================================

	app.get("/api/human-wanted", async (_request, reply) => {
		try {
			const prisma = await getPrisma();
			const items = await prisma.humanWanted.findMany({
				orderBy: { shares: "desc" },
				take: 30,
			});
			return items;
		} catch {
			return reply.code(503).send({ error: "Database unavailable" });
		}
	});

	app.post("/api/human-wanted/:id/share", async (request, reply) => {
		const { id } = request.params as { id: string };
		try {
			const prisma = await getPrisma();
			const updated = await prisma.humanWanted.update({
				where: { id },
				data: { shares: { increment: 1 } },
			});
			return updated;
		} catch {
			return reply.code(503).send({ error: "Database unavailable" });
		}
	});

	// ===========================================================================
	// Versus (AI vs Human)
	// ===========================================================================

	const VersusVoteSchema = z.object({
		vote: z.enum(["ai", "human"]),
	});

	app.get("/api/ai-vs-human", async (_request, reply) => {
		try {
			const prisma = await getPrisma();
			const items = await prisma.versusItem.findMany({
				where: { winner: "undecided" },
				orderBy: { createdAt: "desc" },
				take: 30,
			});
			return items;
		} catch {
			return reply.code(503).send({ error: "Database unavailable" });
		}
	});

	app.post("/api/ai-vs-human/:id/vote", async (request, reply) => {
		const parse = VersusVoteSchema.safeParse(request.body);
		if (!parse.success) {
			return reply.code(400).send({ error: formatZodError(parse.error) });
		}

		const { id } = request.params as { id: string };
		const { vote } = parse.data;

		try {
			const prisma = await getPrisma();
			const field = vote === "ai" ? "aiVotes" : "humanVotes";
			const updated = await prisma.versusItem.update({
				where: { id },
				data: { [field]: { increment: 1 } },
			});

			const totalVotes = updated.aiVotes + updated.humanVotes;
			if (totalVotes >= 10) {
				const aiRatio = updated.aiVotes / totalVotes;
				const newWinner = aiRatio > 0.5 ? "ai" : aiRatio < 0.5 ? "human" : "undecided";
				const finalUpdate = await prisma.versusItem.update({
					where: { id },
					data: { winner: newWinner },
				});
				return finalUpdate;
			}

			return updated;
		} catch {
			return reply.code(503).send({ error: "Database unavailable" });
		}
	});

	// ===========================================================================
	// Unsolved Problems (by category)
	// ===========================================================================

	app.get("/api/unsolved", async (_request, _reply) => {
		const categories = [
			"ai_unsolved",
			"info_conflict",
			"experience_gap",
			"source_gap",
			"outdated",
		] as const;
		const labels: Record<string, string> = {
			ai_unsolved: "AI가 해결하지 못함",
			info_conflict: "정보가 서로 충돌함",
			experience_gap: "실제 경험 부족",
			source_gap: "검증된 자료 부족",
			outdated: "최신 정보 부족",
		};

		try {
			const prisma = await getPrisma();
			const counts = await Promise.all(
				categories.map(async (category) => {
					const count = await prisma.helpNeeded.count({
						where: { category, status: "open" },
					});
					return { category, label: labels[category], count };
				}),
			);
			return counts;
		} catch {
			return categories.map((c) => ({
				category: c,
				label: labels[c],
				count: 0,
			}));
		}
	});

	// ===========================================================================
	// Rewards Table
	// ===========================================================================

	app.get("/api/rewards/table", async () => {
		return [
			{ reason: "Answer", credits: 120 },
			{ reason: "Verify", credits: 80 },
			{ reason: "Teach", credits: 250 },
			{ reason: "Compute", credits: 40 },
			{ reason: "Knowledge", credits: 200 },
		];
	});

	app.get("/api/rewards/:actorId", async (request, _reply) => {
		const { actorId } = request.params as { actorId: string };

		try {
			const prisma = await getPrisma();
			const answers = await prisma.helpAnswer.count({
				where: { userId: actorId },
			});
			return {
				actorId,
				balance: answers * 120,
				entries: [],
			};
		} catch {
			return { actorId, balance: 0, entries: [] };
		}
	});
}
