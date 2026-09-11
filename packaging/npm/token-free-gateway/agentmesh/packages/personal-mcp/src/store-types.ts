import type {
	AddExpertiseInput,
	AddMemoryInput,
	AgentReference,
	CreateUserKnowledgeOptions,
	Expertise,
	KnowledgeNode,
	MemoryNode,
	Skill,
	Tool,
	UpsertKnowledgeInput,
	UserKnowledgeObject,
	UserProfile,
	UserStats,
} from "@agentmesh/shared-types";

/**
 * Shared contract for in-memory and Prisma-backed stores.
 */
export interface KnowledgeStore {
	get(userId: string): Promise<UserKnowledgeObject | null>;
	getOrCreate(userId: string, options?: CreateUserKnowledgeOptions): Promise<UserKnowledgeObject>;
	exists(userId: string): Promise<boolean>;
	save(obj: UserKnowledgeObject): Promise<UserKnowledgeObject>;
	delete(userId: string): Promise<boolean>;

	updateProfile(userId: string, patch: Partial<UserProfile>): Promise<UserKnowledgeObject>;

	upsertKnowledge(userId: string, input: UpsertKnowledgeInput): Promise<KnowledgeNode>;
	removeKnowledge(userId: string, knowledgeId: string): Promise<boolean>;
	listKnowledge(
		userId: string,
		filter?: { categoryId?: string; visibility?: string },
	): Promise<KnowledgeNode[]>;

	addMemory(userId: string, input: AddMemoryInput): Promise<MemoryNode>;
	listMemories(userId: string, limit?: number): Promise<MemoryNode[]>;

	addOrBoostExpertise(userId: string, input: AddExpertiseInput): Promise<Expertise>;
	listExpertise(userId: string): Promise<Expertise[]>;

	addSkill(userId: string, skill: Skill): Promise<void>;
	addTool(userId: string, tool: Tool): Promise<void>;
	linkAgent(userId: string, agent: AgentReference): Promise<void>;

	bumpStats(
		userId: string,
		delta: Partial<Pick<UserStats, "contributions" | "citations" | "helpfulness">>,
	): Promise<void>;

	snapshot(userId: string): Promise<{
		profile: UserProfile;
		expertise: Expertise[];
		stats: UserStats;
		topSkills: Skill[];
		knowledgeCount: number;
		memoryCount: number;
	} | null>;
}
