/**
 * Prisma-backed UserKnowledgeObject store.
 * Drop-in replacement for the in-memory UserKnowledgeObjectStore.
 *
 * Usage:
 *   import { PrismaUserKnowledgeStore } from "./prisma-store";
 *   import { prisma } from "@muhanai/db";
 *   export const userKnowledgeStore = new PrismaUserKnowledgeStore(prisma);
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import type { CategoryContext, SourceType, Visibility } from "../../shared/types";
import type {
	AddExpertiseInput,
	AddMemoryInput,
	AgentReference,
	CreateUserKnowledgeOptions,
	Expertise,
	KnowledgeNode,
	KnowledgePermissions,
	MemoryNode,
	Skill,
	Tool,
	UpsertKnowledgeInput,
	UserKnowledgeObject,
	UserProfile,
	UserStats,
} from "../../shared/types/user-knowledge";

type SourceTypeT = SourceType;
type VisibilityT = Visibility;

function defaultPermissions(userId: string): KnowledgePermissions {
	return {
		readableBy: [userId],
		usableByAgents: true,
		commercialUse: false,
	};
}

function emptyStats(): UserStats {
	return {
		contributions: 0,
		citations: 0,
		helpfulness: 0,
		knowledgeCount: 0,
		memoryCount: 0,
		expertiseDomains: 0,
	};
}

// ---------------------------------------------------------------------------
// Mappers: Prisma row → domain types
// ---------------------------------------------------------------------------

function mapKnowledge(
	row: {
		id: string;
		ownerId: string;
		categoryId: string | null;
		title: string;
		content: string;
		sourceType: string;
		visibility: string;
		confidence: number;
		metadata: Prisma.JsonValue | null;
		createdAt: Date;
		updatedAt: Date;
		permissions?: {
			readableBy: string[];
			usableByAgents: boolean;
			commercialUse: boolean;
		} | null;
	},
	userId: string,
): KnowledgeNode {
	return {
		id: row.id,
		ownerId: row.ownerId,
		categoryId: row.categoryId ?? "general",
		title: row.title,
		content: row.content,
		sourceType: row.sourceType as SourceTypeT,
		visibility: row.visibility as VisibilityT,
		permissions: row.permissions
			? {
					readableBy: row.permissions.readableBy,
					usableByAgents: row.permissions.usableByAgents,
					commercialUse: row.permissions.commercialUse,
				}
			: defaultPermissions(userId),
		confidence: row.confidence,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		metadata: (row.metadata as Record<string, unknown>) ?? undefined,
	};
}

function mapMemory(row: {
	id: string;
	userId: string;
	content: string;
	importance: number;
	context: Prisma.JsonValue | null;
	createdAt: Date;
	lastAccessedAt: Date | null;
}): MemoryNode {
	return {
		id: row.id,
		userId: row.userId,
		content: row.content,
		importance: row.importance,
		context: (row.context as unknown as CategoryContext) ?? undefined,
		createdAt: row.createdAt,
		lastAccessedAt: row.lastAccessedAt ?? undefined,
	};
}

function mapExpertise(row: {
	id: string;
	domain: string;
	subdomain: string | null;
	jurisdiction: string[];
	level: number;
	evidenceCount: number;
}): Expertise {
	return {
		id: row.id,
		domain: row.domain,
		subdomain: row.subdomain ?? undefined,
		jurisdiction: row.jurisdiction,
		level: row.level,
		evidenceCount: row.evidenceCount,
	};
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class PrismaUserKnowledgeStore {
	constructor(private db: PrismaClient) {}

	async get(userId: string): Promise<UserKnowledgeObject | null> {
		const user = await this.db.user.findUnique({
			where: { id: userId },
			include: {
				profile: true,
				personalMcp: true,
				stats: true,
				knowledgeNodes: { include: { permissions: true } },
				memories: true,
				expertise: true,
				skills: true,
				tools: true,
				agentLinks: true,
			},
		});

		if (!user) return null;
		return this.toUKO(user);
	}

	async exists(userId: string): Promise<boolean> {
		const n = await this.db.user.count({ where: { id: userId } });
		return n > 0;
	}

	async getOrCreate(
		userId: string,
		options?: CreateUserKnowledgeOptions,
	): Promise<UserKnowledgeObject> {
		const existing = await this.get(userId);
		if (existing) return existing;

		await this.db.$transaction(async (tx) => {
			await tx.user.create({
				data: {
					id: userId,
					name: options?.profile?.name,
					profile: {
						create: {
							name: options?.profile?.name,
							description: options?.profile?.description,
							languages: options?.profile?.languages ?? ["en"],
							timezone: options?.profile?.timezone,
							preferredJurisdiction: options?.profile?.preferredJurisdiction ?? [],
							avatarUrl: options?.profile?.avatarUrl,
							metadata: (options?.metadata as Prisma.InputJsonValue) ?? undefined,
						},
					},
					personalMcp: {
						create: {
							endpoint: `mcp://user/${userId}`,
							config: {},
							version: 1,
						},
					},
					stats: {
						create: {},
					},
				},
			});
		});

		const created = await this.get(userId);
		if (!created) throw new Error("Failed to create UserKnowledgeObject");
		return created;
	}

	async save(obj: UserKnowledgeObject): Promise<UserKnowledgeObject> {
		// Partial save of profile + stats (collections have dedicated methods)
		await this.db.$transaction([
			this.db.userProfile.upsert({
				where: { userId: obj.userId },
				create: {
					userId: obj.userId,
					name: obj.profile.name,
					description: obj.profile.description,
					languages: obj.profile.languages,
					timezone: obj.profile.timezone,
					preferredJurisdiction: obj.profile.preferredJurisdiction ?? [],
					avatarUrl: obj.profile.avatarUrl,
				},
				update: {
					name: obj.profile.name,
					description: obj.profile.description,
					languages: obj.profile.languages,
					timezone: obj.profile.timezone,
					preferredJurisdiction: obj.profile.preferredJurisdiction ?? [],
					avatarUrl: obj.profile.avatarUrl,
				},
			}),
			this.db.userStatsRow.upsert({
				where: { userId: obj.userId },
				create: {
					userId: obj.userId,
					contributions: obj.stats.contributions,
					citations: obj.stats.citations,
					helpfulness: obj.stats.helpfulness,
					knowledgeCount: obj.stats.knowledgeCount,
					memoryCount: obj.stats.memoryCount,
					expertiseDomains: obj.stats.expertiseDomains,
					lastActiveAt: obj.stats.lastActiveAt,
				},
				update: {
					contributions: obj.stats.contributions,
					citations: obj.stats.citations,
					helpfulness: obj.stats.helpfulness,
					knowledgeCount: obj.stats.knowledgeCount,
					memoryCount: obj.stats.memoryCount,
					expertiseDomains: obj.stats.expertiseDomains,
					lastActiveAt: obj.stats.lastActiveAt ?? new Date(),
				},
			}),
			this.db.personalMcp.updateMany({
				where: { userId: obj.userId },
				data: { version: obj.version },
			}),
		]);

		return (await this.get(obj.userId))!;
	}

	async delete(userId: string): Promise<boolean> {
		try {
			await this.db.user.delete({ where: { id: userId } });
			return true;
		} catch {
			return false;
		}
	}

	async updateProfile(userId: string, patch: Partial<UserProfile>): Promise<UserKnowledgeObject> {
		await this.getOrCreate(userId);
		await this.db.userProfile.update({
			where: { userId },
			data: {
				name: patch.name,
				description: patch.description,
				languages: patch.languages,
				timezone: patch.timezone,
				preferredJurisdiction: patch.preferredJurisdiction,
				avatarUrl: patch.avatarUrl,
			},
		});
		if (patch.name) {
			await this.db.user.update({
				where: { id: userId },
				data: { name: patch.name },
			});
		}
		return (await this.get(userId))!;
	}

	async upsertKnowledge(userId: string, input: UpsertKnowledgeInput): Promise<KnowledgeNode> {
		await this.getOrCreate(userId);

		// Ensure category row exists (soft — optional FK)
		if (input.categoryId) {
			const domain = input.categoryId.split(".")[0]!;
			const subdomain = input.categoryId.includes(".")
				? input.categoryId.split(".").slice(1).join(".")
				: null;
			await this.db.category.upsert({
				where: { id: input.categoryId },
				create: {
					id: input.categoryId,
					domain,
					subdomain,
				},
				update: {},
			});
		}

		const data = {
			ownerId: userId,
			categoryId: input.categoryId,
			title: input.title,
			content: input.content,
			sourceType: input.sourceType ?? "experience",
			visibility: input.visibility ?? "private",
			confidence: input.confidence ?? 0.7,
			metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
		};

		let row;
		if (input.id) {
			row = await this.db.knowledgeNode.upsert({
				where: { id: input.id },
				create: {
					id: input.id,
					...data,
					permissions: {
						create: {
							readableBy: [userId],
							usableByAgents: true,
							commercialUse: false,
						},
					},
				},
				update: data,
				include: { permissions: true },
			});
		} else {
			row = await this.db.knowledgeNode.create({
				data: {
					...data,
					permissions: {
						create: {
							readableBy: [userId],
							usableByAgents: true,
							commercialUse: false,
						},
					},
				},
				include: { permissions: true },
			});
		}

		await this.recomputeStats(userId, { contributionsDelta: input.id ? 0 : 1 });
		return mapKnowledge(row, userId);
	}

	async removeKnowledge(userId: string, knowledgeId: string): Promise<boolean> {
		const result = await this.db.knowledgeNode.deleteMany({
			where: { id: knowledgeId, ownerId: userId },
		});
		if (result.count > 0) await this.recomputeStats(userId);
		return result.count > 0;
	}

	async listKnowledge(
		userId: string,
		filter?: { categoryId?: string; visibility?: string },
	): Promise<KnowledgeNode[]> {
		const rows = await this.db.knowledgeNode.findMany({
			where: {
				ownerId: userId,
				...(filter?.visibility ? { visibility: filter.visibility } : {}),
				...(filter?.categoryId ? { categoryId: { startsWith: filter.categoryId } } : {}),
			},
			include: { permissions: true },
			orderBy: { updatedAt: "desc" },
		});
		return rows.map((r) => mapKnowledge(r, userId));
	}

	async addMemory(userId: string, input: AddMemoryInput): Promise<MemoryNode> {
		await this.getOrCreate(userId);
		const row = await this.db.userMemory.create({
			data: {
				userId,
				content: input.content,
				importance: input.importance ?? 0.5,
				context: (input.context as unknown as Prisma.InputJsonValue) ?? undefined,
			},
		});
		await this.recomputeStats(userId);
		return mapMemory(row);
	}

	async listMemories(userId: string, limit = 20): Promise<MemoryNode[]> {
		const rows = await this.db.userMemory.findMany({
			where: { userId },
			orderBy: { importance: "desc" },
			take: limit,
		});
		return rows.map(mapMemory);
	}

	async addOrBoostExpertise(userId: string, input: AddExpertiseInput): Promise<Expertise> {
		await this.getOrCreate(userId);

		const existing = await this.db.userExpertise.findFirst({
			where: {
				userId,
				domain: input.domain,
				subdomain: input.subdomain ?? null,
			},
		});

		if (existing) {
			// jurisdiction overlap check is soft; boost level
			const row = await this.db.userExpertise.update({
				where: { id: existing.id },
				data: {
					level: Math.min(1, existing.level + (input.level ?? 0.05)),
					evidenceCount: existing.evidenceCount + (input.evidenceCount ?? 1),
					jurisdiction: input.jurisdiction ?? existing.jurisdiction,
				},
			});
			await this.recomputeStats(userId);
			return mapExpertise(row);
		}

		const row = await this.db.userExpertise.create({
			data: {
				userId,
				domain: input.domain,
				subdomain: input.subdomain,
				jurisdiction: input.jurisdiction ?? [],
				level: input.level ?? 0.15,
				evidenceCount: input.evidenceCount ?? 1,
			},
		});
		await this.recomputeStats(userId);
		return mapExpertise(row);
	}

	async listExpertise(userId: string): Promise<Expertise[]> {
		const rows = await this.db.userExpertise.findMany({
			where: { userId },
			orderBy: { level: "desc" },
		});
		return rows.map(mapExpertise);
	}

	async addSkill(userId: string, skill: Skill): Promise<void> {
		await this.getOrCreate(userId);
		await this.db.userSkill.upsert({
			where: { userId_name: { userId, name: skill.name } },
			create: {
				userId,
				name: skill.name,
				description: skill.description,
				category: skill.category,
				proficiency: skill.proficiency,
			},
			update: {
				description: skill.description,
				category: skill.category,
				proficiency: skill.proficiency,
			},
		});
	}

	async addTool(userId: string, tool: Tool): Promise<void> {
		await this.getOrCreate(userId);
		await this.db.userTool.upsert({
			where: { userId_name: { userId, name: tool.name } },
			create: {
				userId,
				name: tool.name,
				description: tool.description,
				inputSchema: (tool.inputSchema as Prisma.InputJsonValue) ?? undefined,
				outputSchema: (tool.outputSchema as Prisma.InputJsonValue) ?? undefined,
			},
			update: {
				description: tool.description,
				inputSchema: (tool.inputSchema as Prisma.InputJsonValue) ?? undefined,
				outputSchema: (tool.outputSchema as Prisma.InputJsonValue) ?? undefined,
			},
		});
	}

	async linkAgent(userId: string, agent: AgentReference): Promise<void> {
		await this.getOrCreate(userId);
		await this.db.userAgentLink.upsert({
			where: { userId_agentId: { userId, agentId: agent.id } },
			create: {
				userId,
				agentId: agent.id,
				name: agent.name,
				domain: agent.domain,
				version: agent.version,
			},
			update: {
				name: agent.name,
				domain: agent.domain,
				version: agent.version,
			},
		});
	}

	async bumpStats(
		userId: string,
		delta: Partial<Pick<UserStats, "contributions" | "citations" | "helpfulness">>,
	): Promise<void> {
		await this.getOrCreate(userId);
		await this.db.userStatsRow.update({
			where: { userId },
			data: {
				contributions: delta.contributions ? { increment: delta.contributions } : undefined,
				citations: delta.citations ? { increment: delta.citations } : undefined,
				helpfulness: delta.helpfulness ? { increment: delta.helpfulness } : undefined,
				lastActiveAt: new Date(),
			},
		});
	}

	async snapshot(userId: string) {
		const obj = await this.get(userId);
		if (!obj) return null;
		return {
			profile: obj.profile,
			expertise: [...obj.expertise].sort((a, b) => b.level - a.level).slice(0, 10),
			stats: obj.stats,
			topSkills: [...obj.skills].sort((a, b) => b.proficiency - a.proficiency).slice(0, 10),
			knowledgeCount: obj.knowledge.length,
			memoryCount: obj.memories.length,
		};
	}

	// -------------------------------------------------------------------------
	// Internals
	// -------------------------------------------------------------------------

	private async recomputeStats(userId: string, opts?: { contributionsDelta?: number }) {
		const [knowledgeCount, memoryCount, expertiseDomains, stats] = await Promise.all([
			this.db.knowledgeNode.count({ where: { ownerId: userId } }),
			this.db.userMemory.count({ where: { userId } }),
			this.db.userExpertise.groupBy({ by: ["domain"], where: { userId } }).then((g) => g.length),
			this.db.userStatsRow.findUnique({ where: { userId } }),
		]);

		await this.db.userStatsRow.upsert({
			where: { userId },
			create: {
				userId,
				knowledgeCount,
				memoryCount,
				expertiseDomains,
				contributions: opts?.contributionsDelta ?? 0,
				lastActiveAt: new Date(),
			},
			update: {
				knowledgeCount,
				memoryCount,
				expertiseDomains,
				contributions: opts?.contributionsDelta
					? { increment: opts.contributionsDelta }
					: undefined,
				lastActiveAt: new Date(),
			},
		});

		// silence unused
		void stats;
	}

	private toUKO(user: {
		id: string;
		profile: {
			name: string | null;
			description: string | null;
			languages: string[];
			timezone: string | null;
			preferredJurisdiction: string[];
			avatarUrl: string | null;
		} | null;
		personalMcp: { version: number } | null;
		stats: {
			contributions: number;
			citations: number;
			helpfulness: number;
			knowledgeCount: number;
			memoryCount: number;
			expertiseDomains: number;
			lastActiveAt: Date | null;
		} | null;
		knowledgeNodes: Parameters<typeof mapKnowledge>[0][];
		memories: Parameters<typeof mapMemory>[0][];
		expertise: Parameters<typeof mapExpertise>[0][];
		skills: {
			id: string;
			name: string;
			description: string | null;
			category: string | null;
			proficiency: number;
		}[];
		tools: {
			id: string;
			name: string;
			description: string | null;
			inputSchema: Prisma.JsonValue | null;
			outputSchema: Prisma.JsonValue | null;
		}[];
		agentLinks: {
			agentId: string;
			name: string;
			domain: string;
			version: string | null;
		}[];
		createdAt: Date;
		updatedAt: Date;
	}): UserKnowledgeObject {
		const profile: UserProfile = {
			name: user.profile?.name ?? undefined,
			description: user.profile?.description ?? undefined,
			languages: user.profile?.languages ?? ["en"],
			timezone: user.profile?.timezone ?? undefined,
			preferredJurisdiction: user.profile?.preferredJurisdiction,
			avatarUrl: user.profile?.avatarUrl ?? undefined,
		};

		const stats: UserStats = user.stats
			? {
					contributions: user.stats.contributions,
					citations: user.stats.citations,
					helpfulness: user.stats.helpfulness,
					knowledgeCount: user.stats.knowledgeCount,
					memoryCount: user.stats.memoryCount,
					expertiseDomains: user.stats.expertiseDomains,
					lastActiveAt: user.stats.lastActiveAt ?? undefined,
				}
			: emptyStats();

		return {
			id: `uko_${user.id}`,
			userId: user.id,
			version: user.personalMcp?.version ?? 1,
			profile,
			knowledge: user.knowledgeNodes.map((k) => mapKnowledge(k, user.id)),
			memories: user.memories.map(mapMemory),
			skills: user.skills.map(
				(s): Skill => ({
					id: s.id,
					name: s.name,
					description: s.description ?? "",
					category: s.category ?? undefined,
					proficiency: s.proficiency,
				}),
			),
			tools: user.tools.map(
				(t): Tool => ({
					id: t.id,
					name: t.name,
					description: t.description ?? "",
					inputSchema: (t.inputSchema as Record<string, unknown>) ?? undefined,
					outputSchema: (t.outputSchema as Record<string, unknown>) ?? undefined,
				}),
			),
			agents: user.agentLinks.map(
				(a): AgentReference => ({
					id: a.agentId,
					name: a.name,
					domain: a.domain,
					version: a.version ?? undefined,
				}),
			),
			expertise: user.expertise.map(mapExpertise),
			permissions: defaultPermissions(user.id),
			stats,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
		};
	}
}
