import { type CategoryDefinition, DEFAULT_CATEGORIES, type DomainCategory } from "./category";

export class Taxonomy {
	private categories: Map<string, CategoryDefinition> = new Map();

	constructor(initial: CategoryDefinition[] = DEFAULT_CATEGORIES) {
		for (const cat of initial) {
			this.categories.set(cat.id, cat);
		}
	}

	register(category: CategoryDefinition): void {
		this.categories.set(category.id, category);
	}

	get(domain: string): CategoryDefinition | undefined {
		return this.categories.get(domain);
	}

	list(): CategoryDefinition[] {
		return Array.from(this.categories.values());
	}

	getSubdomains(domain: DomainCategory): string[] {
		return this.categories.get(domain)?.subdomains ?? [];
	}

	exists(domain: string): boolean {
		return this.categories.has(domain);
	}
}

export const globalTaxonomy = new Taxonomy();
