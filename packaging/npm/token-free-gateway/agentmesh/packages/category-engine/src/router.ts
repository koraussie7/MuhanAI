import { fastDecider } from "@agentmesh/llm-router";
import type { CategoryContext } from "@agentmesh/shared-types";
import { DOMAIN_CATEGORIES, DOMAIN_INTENT_LABELS, type DomainCategory } from "./category.js";
import { CategoryClassifier, type ClassificationResult } from "./classifier.js";
import { globalTaxonomy } from "./taxonomy.js";

export class CategoryRouter {
	constructor(private classifier: CategoryClassifier = new CategoryClassifier()) {}

	async classify(text: string, hint?: Partial<CategoryContext>): Promise<ClassificationResult> {
		// System 1 fast-path via Laya: 33ms로 도메인 분류 → confidence ≥ threshold이면 LLM 분류 건너뜀.
		try {
			const fast = await fastDecider.decideIntent(text, DOMAIN_INTENT_LABELS, 0.8);
			if (!fast.needsLLM) {
				const domain = fast.intent as DomainCategory | undefined;
				if (domain && DOMAIN_CATEGORIES.includes(domain)) {
					return {
						domain,
						subdomain: hint?.subdomain,
						jurisdiction: hint?.jurisdiction,
						task: hint?.task,
						riskLevel: "medium",
						confidence: fast.confidence,
					};
				}
			}
		} catch {
			// Fast-decider sidecar unavailable → fall back to keyword classifier
		}

		// Fallback to full classifier (LLM-based / keyword-based)
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
