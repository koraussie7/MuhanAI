import type {
  UserKnowledgeObject,
  CreateUserKnowledgeOptions,
  UpsertKnowledgeInput,
  AddMemoryInput,
  AddExpertiseInput,
  UserProfile,
  UserStats,
  KnowledgeNode,
  MemoryNode,
  Expertise,
  Skill,
  Tool,
  AgentReference,
  KnowledgePermissions,
} from "../../shared/types/user-knowledge";
import { createDefaultPermissions } from "./permissions";

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createUserKnowledgeObject(
  userId: string,
  options: CreateUserKnowledgeOptions = {}
): UserKnowledgeObject {
  const now = new Date();
  const profile: UserProfile = {
    name: options.profile?.name,
    description: options.profile?.description,
    languages: options.profile?.languages ?? ["en"],
    timezone: options.profile?.timezone,
    preferredJurisdiction: options.profile?.preferredJurisdiction,
    avatarUrl: options.profile?.avatarUrl,
  };

  const permissions: KnowledgePermissions = {
    readableBy: [userId],
    usableByAgents: true,
    commercialUse: false,
    ...options.permissions,
  };

  return {
    id: `uko_${userId}`,
    userId,
    version: 1,
    profile,
    knowledge: [],
    memories: [],
    skills: [],
    tools: [],
    agents: [],
    expertise: [],
    permissions,
    stats: emptyStats(),
    createdAt: now,
    updatedAt: now,
    metadata: options.metadata,
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

function recomputeStats(obj: UserKnowledgeObject): UserStats {
  return {
    contributions: obj.stats.contributions,
    citations: obj.stats.citations,
    helpfulness: obj.stats.helpfulness,
    knowledgeCount: obj.knowledge.length,
    memoryCount: obj.memories.length,
    expertiseDomains: new Set(obj.expertise.map((e) => e.domain)).size,
    lastActiveAt: new Date(),
  };
}

function touch(obj: UserKnowledgeObject): void {
  obj.updatedAt = new Date();
  obj.version += 1;
  obj.stats = recomputeStats(obj);
}

// ---------------------------------------------------------------------------
// ID helpers
// ---------------------------------------------------------------------------

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Store (in-memory; swap for Prisma later)
// ---------------------------------------------------------------------------

export class UserKnowledgeObjectStore {
  private store = new Map<string, UserKnowledgeObject>();

  async get(userId: string): Promise<UserKnowledgeObject | null> {
    const obj = this.store.get(userId);
    return obj ? structuredClone(obj) : null;
  }

  async getOrCreate(
    userId: string,
    options?: CreateUserKnowledgeOptions
  ): Promise<UserKnowledgeObject> {
    let obj = this.store.get(userId);
    if (!obj) {
      obj = createUserKnowledgeObject(userId, options);
      this.store.set(userId, obj);
    }
    return structuredClone(obj);
  }

  async exists(userId: string): Promise<boolean> {
    return this.store.has(userId);
  }

  async save(obj: UserKnowledgeObject): Promise<UserKnowledgeObject> {
    touch(obj);
    this.store.set(obj.userId, obj);
    return structuredClone(obj);
  }

  async delete(userId: string): Promise<boolean> {
    return this.store.delete(userId);
  }

  // ----- Profile -----

  async updateProfile(
    userId: string,
    patch: Partial<UserProfile>
  ): Promise<UserKnowledgeObject> {
    const obj = await this.require(userId);
    obj.profile = { ...obj.profile, ...patch };
    return this.save(obj);
  }

  // ----- Knowledge -----

  async upsertKnowledge(
    userId: string,
    input: UpsertKnowledgeInput
  ): Promise<KnowledgeNode> {
    const obj = await this.require(userId);
    const now = new Date();

    if (input.id) {
      const idx = obj.knowledge.findIndex((k) => k.id === input.id);
      if (idx >= 0) {
        const existing = obj.knowledge[idx]!;
        const updated: KnowledgeNode = {
          ...existing,
          title: input.title,
          content: input.content,
          categoryId: input.categoryId,
          sourceType: input.sourceType ?? existing.sourceType,
          visibility: input.visibility ?? existing.visibility,
          confidence: input.confidence ?? existing.confidence,
          metadata: { ...existing.metadata, ...input.metadata },
          updatedAt: now,
        };
        obj.knowledge[idx] = updated;
        await this.save(obj);
        return updated;
      }
    }

    const node: KnowledgeNode = {
      id: input.id ?? uid("kn"),
      ownerId: userId,
      categoryId: input.categoryId,
      title: input.title,
      content: input.content,
      sourceType: input.sourceType ?? "experience",
      visibility: input.visibility ?? "private",
      permissions: { ...obj.permissions },
      confidence: input.confidence ?? 0.7,
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata,
    };

    obj.knowledge.push(node);
    obj.stats.contributions += 1;
    await this.save(obj);
    return node;
  }

  async removeKnowledge(userId: string, knowledgeId: string): Promise<boolean> {
    const obj = await this.require(userId);
    const before = obj.knowledge.length;
    obj.knowledge = obj.knowledge.filter((k) => k.id !== knowledgeId);
    if (obj.knowledge.length === before) return false;
    await this.save(obj);
    return true;
  }

  async listKnowledge(
    userId: string,
    filter?: { categoryId?: string; visibility?: string }
  ): Promise<KnowledgeNode[]> {
    const obj = await this.get(userId);
    if (!obj) return [];
    return obj.knowledge.filter((k) => {
      if (filter?.categoryId && !k.categoryId.startsWith(filter.categoryId)) return false;
      if (filter?.visibility && k.visibility !== filter.visibility) return false;
      return true;
    });
  }

  // ----- Memory -----

  async addMemory(userId: string, input: AddMemoryInput): Promise<MemoryNode> {
    const obj = await this.require(userId);
    const memory: MemoryNode = {
      id: uid("mem"),
      userId,
      content: input.content,
      context: input.context,
      importance: input.importance ?? 0.5,
      createdAt: new Date(),
    };
    obj.memories.push(memory);
    // Keep last 500 memories
    if (obj.memories.length > 500) {
      obj.memories = obj.memories
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 500);
    }
    await this.save(obj);
    return memory;
  }

  async listMemories(userId: string, limit = 20): Promise<MemoryNode[]> {
    const obj = await this.get(userId);
    if (!obj) return [];
    return [...obj.memories]
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);
  }

  // ----- Expertise -----

  async addOrBoostExpertise(
    userId: string,
    input: AddExpertiseInput
  ): Promise<Expertise> {
    const obj = await this.require(userId);
    const key = (e: Expertise) =>
      `${e.domain}|${e.subdomain ?? ""}|${(e.jurisdiction ?? []).sort().join(",")}`;

    const existing = obj.expertise.find(
      (e) =>
        key(e) ===
        key({
          id: "",
          domain: input.domain,
          subdomain: input.subdomain,
          jurisdiction: input.jurisdiction,
          level: 0,
          evidenceCount: 0,
        })
    );

    if (existing) {
      existing.level = Math.min(1, existing.level + (input.level ?? 0.05));
      existing.evidenceCount += input.evidenceCount ?? 1;
      await this.save(obj);
      return existing;
    }

    const expertise: Expertise = {
      id: uid("exp"),
      domain: input.domain,
      subdomain: input.subdomain,
      jurisdiction: input.jurisdiction,
      level: input.level ?? 0.15,
      evidenceCount: input.evidenceCount ?? 1,
    };
    obj.expertise.push(expertise);
    await this.save(obj);
    return expertise;
  }

  async listExpertise(userId: string): Promise<Expertise[]> {
    const obj = await this.get(userId);
    return obj?.expertise ?? [];
  }

  // ----- Skills / Tools / Agents -----

  async addSkill(userId: string, skill: Skill): Promise<void> {
    const obj = await this.require(userId);
    const idx = obj.skills.findIndex((s) => s.id === skill.id || s.name === skill.name);
    if (idx >= 0) obj.skills[idx] = { ...obj.skills[idx], ...skill };
    else obj.skills.push(skill);
    await this.save(obj);
  }

  async addTool(userId: string, tool: Tool): Promise<void> {
    const obj = await this.require(userId);
    const idx = obj.tools.findIndex((t) => t.id === tool.id || t.name === tool.name);
    if (idx >= 0) obj.tools[idx] = { ...obj.tools[idx], ...tool };
    else obj.tools.push(tool);
    await this.save(obj);
  }

  async linkAgent(userId: string, agent: AgentReference): Promise<void> {
    const obj = await this.require(userId);
    if (!obj.agents.some((a) => a.id === agent.id)) {
      obj.agents.push(agent);
      await this.save(obj);
    }
  }

  // ----- Stats -----

  async bumpStats(
    userId: string,
    delta: Partial<Pick<UserStats, "contributions" | "citations" | "helpfulness">>
  ): Promise<void> {
    const obj = await this.require(userId);
    if (delta.contributions) obj.stats.contributions += delta.contributions;
    if (delta.citations) obj.stats.citations += delta.citations;
    if (delta.helpfulness) obj.stats.helpfulness += delta.helpfulness;
    await this.save(obj);
  }

  // ----- Snapshot (for MCP / agents) -----

  async snapshot(userId: string): Promise<{
    profile: UserProfile;
    expertise: Expertise[];
    stats: UserStats;
    topSkills: Skill[];
    knowledgeCount: number;
    memoryCount: number;
  } | null> {
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

  private async require(userId: string): Promise<UserKnowledgeObject> {
    const obj = this.store.get(userId);
    if (!obj) {
      throw new Error(`UserKnowledgeObject not found for userId=${userId}. Call getOrCreate first.`);
    }
    // Return mutable reference for internal mutations (we clone on public get)
    return obj;
  }
}

export const userKnowledgeStore = new UserKnowledgeObjectStore();

// Back-compat alias used by older modules
export const createEmptyUserKnowledgeObject = createUserKnowledgeObject;
