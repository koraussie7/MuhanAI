import type { Tool } from "../../shared/types";
import { personalKnowledgeService } from "./knowledge";
import { personalMemoryService } from "./memory";
import { getKnowledgeStore } from "./store-factory";
import { executePersonalTool, PERSONAL_MCP_TOOLS } from "./tools";

// ---------------------------------------------------------------------------
// MCP-style resource & prompt types (logical, in-process)
// ---------------------------------------------------------------------------

export interface McpResource<T = unknown> {
	uri: string;
	name: string;
	description?: string;
	mimeType?: string;
	list: () => Promise<T>;
	read?: (id: string) => Promise<T | null>;
}

export interface McpPrompt {
	name: string;
	description?: string;
	render: (args?: Record<string, string>) => Promise<string>;
}

/**
 * Personal MCP — one logical endpoint per user.
 */
export interface PersonalMCP {
	userId: string;
	endpoint: string;

	resources: {
		profile: McpResource;
		knowledge: McpResource;
		memories: McpResource;
		expertise: McpResource;
		skills: McpResource;
	};

	tools: Tool[];

	prompts: {
		personalContext: McpPrompt;
		expertiseSummary: McpPrompt;
		knowledgeBrief: McpPrompt;
	};

	callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
	ensure: (profile?: { name?: string; languages?: string[] }) => Promise<void>;
	snapshot: () => Promise<{
		profile: import("../../shared/types/user-knowledge").UserProfile;
		expertise: import("../../shared/types/user-knowledge").Expertise[];
		stats: import("../../shared/types/user-knowledge").UserStats;
		topSkills: import("../../shared/types/user-knowledge").Skill[];
		knowledgeCount: number;
		memoryCount: number;
	} | null>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPersonalMCP(userId: string): PersonalMCP {
	const endpoint = `mcp://user/${userId}`;

	const resources: PersonalMCP["resources"] = {
		profile: {
			uri: `${endpoint}/profile`,
			name: "profile",
			description: "User profile (name, languages, preferences)",
			mimeType: "application/json",
			list: async () => {
				const store = await getKnowledgeStore();
				const obj = await store.get(userId);
				return obj?.profile ?? null;
			},
		},
		knowledge: {
			uri: `${endpoint}/knowledge`,
			name: "knowledge",
			description: "User-owned knowledge nodes",
			mimeType: "application/json",
			list: async () => {
				const store = await getKnowledgeStore();
				return store.listKnowledge(userId);
			},
			read: async (id) => {
				const store = await getKnowledgeStore();
				const list = await store.listKnowledge(userId);
				return list.find((k) => k.id === id) ?? null;
			},
		},
		memories: {
			uri: `${endpoint}/memory`,
			name: "memories",
			description: "User episodic / working memories",
			mimeType: "application/json",
			list: async () => {
				const store = await getKnowledgeStore();
				return store.listMemories(userId, 50);
			},
		},
		expertise: {
			uri: `${endpoint}/expertise`,
			name: "expertise",
			description: "Aggregated expertise by domain / jurisdiction",
			mimeType: "application/json",
			list: async () => {
				const store = await getKnowledgeStore();
				return store.listExpertise(userId);
			},
		},
		skills: {
			uri: `${endpoint}/skills`,
			name: "skills",
			description: "User skills and proficiency",
			mimeType: "application/json",
			list: async () => {
				const store = await getKnowledgeStore();
				const obj = await store.get(userId);
				return obj?.skills ?? [];
			},
		},
	};

	const prompts: PersonalMCP["prompts"] = {
		personalContext: {
			name: "personalContext",
			description: "Compact context block for LLM system prompts",
			render: async (args) => {
				const query = args?.query;
				const store = await getKnowledgeStore();
				const obj = await store.getOrCreate(userId);
				const topExpertise = [...obj.expertise]
					.sort((a, b) => b.level - a.level)
					.slice(0, 5)
					.map(
						(e) =>
							`${e.domain}${e.subdomain ? `/${e.subdomain}` : ""}${
								e.jurisdiction?.length ? ` [${e.jurisdiction.join(",")}]` : ""
							} (lv ${e.level.toFixed(2)})`,
					)
					.join("; ");

				const memories = query
					? await personalMemoryService.retrieve(userId, query, undefined, 3)
					: obj.memories.slice(-3);

				return [
					`## Personal Context`,
					`User: ${obj.profile.name ?? userId}`,
					`Languages: ${obj.profile.languages.join(", ")}`,
					obj.profile.preferredJurisdiction?.length
						? `Preferred jurisdictions: ${obj.profile.preferredJurisdiction.join(", ")}`
						: null,
					`Expertise: ${topExpertise || "none yet"}`,
					`Stats: knowledge=${obj.stats.knowledgeCount}, memories=${obj.stats.memoryCount}, contributions=${obj.stats.contributions}`,
					memories.length
						? `Relevant memories:\n${memories.map((m) => `- ${m.content.slice(0, 140)}`).join("\n")}`
						: null,
				]
					.filter(Boolean)
					.join("\n");
			},
		},
		expertiseSummary: {
			name: "expertiseSummary",
			description: "Human-readable expertise tree",
			render: async () => {
				const store = await getKnowledgeStore();
				const list = await store.listExpertise(userId);
				if (!list.length) return "No expertise recorded yet.";
				const lines = list
					.sort((a, b) => b.level - a.level)
					.map(
						(e) =>
							`- ${e.domain}${e.subdomain ? ` › ${e.subdomain}` : ""}${
								e.jurisdiction?.length ? ` (${e.jurisdiction.join(", ")})` : ""
							}: level ${e.level.toFixed(2)}, evidence ${e.evidenceCount}`,
					);
				return `## Expertise\n${lines.join("\n")}`;
			},
		},
		knowledgeBrief: {
			name: "knowledgeBrief",
			description: "Top knowledge titles for a category or query",
			render: async (args) => {
				const q = args?.query ?? args?.categoryId ?? "";
				const hits = await personalKnowledgeService.search({
					userId,
					query: q,
					categoryId: args?.categoryId,
					limit: 5,
				});
				if (!hits.length) return "No matching knowledge.";
				return hits.map((k, i) => `${i + 1}. [${k.categoryId}] ${k.title}`).join("\n");
			},
		},
	};

	return {
		userId,
		endpoint,
		resources,
		tools: PERSONAL_MCP_TOOLS,
		prompts,
		callTool: (name, args) => executePersonalTool(userId, name, args),
		ensure: async (profile) => {
			const store = await getKnowledgeStore();
			await store.getOrCreate(userId, {
				profile: {
					name: profile?.name,
					languages: profile?.languages,
				},
			});
		},
		snapshot: async () => {
			const store = await getKnowledgeStore();
			return store.snapshot(userId);
		},
	};
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class PersonalMCPRegistry {
	private instances = new Map<string, PersonalMCP>();

	async get(
		userId: string,
		options?: { name?: string; languages?: string[] },
	): Promise<PersonalMCP> {
		let mcp = this.instances.get(userId);
		if (!mcp) {
			mcp = createPersonalMCP(userId);
			this.instances.set(userId, mcp);
		}
		await mcp.ensure(options);
		return mcp;
	}

	async has(userId: string): Promise<boolean> {
		if (this.instances.has(userId)) return true;
		const store = await getKnowledgeStore();
		return store.exists(userId);
	}

	listUserIds(): string[] {
		return Array.from(this.instances.keys());
	}

	release(userId: string): void {
		this.instances.delete(userId);
	}
}

export const personalMcpRegistry = new PersonalMCPRegistry();
