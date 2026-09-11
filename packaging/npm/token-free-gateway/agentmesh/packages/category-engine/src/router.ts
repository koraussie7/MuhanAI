import type { CategoryContext } from "@agentmesh/shared-types";
import { CategoryClassifier, type ClassificationResult } from "./classifier";
import { globalTaxonomy } from "./taxonomy";

export class CategoryRouter {
	constructor(private classifier: CategoryClassifier = new CategoryClassifier()) {}

	async classify(text: string, hint?: Partial<CategoryContext>): Promise<ClassificationResult> {
		return this.classifier.classify(text, hint);
	}

	async routeToDomainAgents(context: CategoryContext): Promise<string[]> {
		// Returns agent IDs / keys that should handle this category
		const agents: string[] = [];

		if (globalTaxonomy.exists(context.domain)) {
			agents.push(`domain:${context.domain}`);
		}

		if (context.subdomain) {
			agents.push(`domain:${context.domain}:${context.subdomain}`);
		}

		if (context.jurisdiction?.length) {
			for (const j of context.jurisdiction) {
				agents.push(`jurisdiction:${j}`);
				agents.push(`domain:${context.domain}:jurisdiction:${j}`);
			}
		}

		// Always include a generalist fallback
		agents.push("general");

		return agents;
	}
}

export const categoryRouter = new CategoryRouter();
