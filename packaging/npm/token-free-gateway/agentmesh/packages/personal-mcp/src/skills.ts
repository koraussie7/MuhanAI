import { Skill } from "../../shared/types";
import { getKnowledgeStore } from "./store-factory";

export class PersonalSkillsService {
  async list(userId: string): Promise<Skill[]> {
    const store = await getKnowledgeStore();
    const obj = await store.get(userId);
    return obj?.skills ?? [];
  }

  async addOrUpdate(userId: string, skill: Skill): Promise<void> {
    const store = await getKnowledgeStore();
    await store.getOrCreate(userId);
    await store.addSkill(userId, skill);
  }

  async findByCategory(userId: string, category: string): Promise<Skill[]> {
    const skills = await this.list(userId);
    return skills.filter((s) => s.category === category);
  }
}

export const personalSkillsService = new PersonalSkillsService();
