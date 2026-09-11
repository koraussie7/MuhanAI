import { createDefaultPermissions } from "@agentmesh/shared-types";
import type { CategoryContext, KnowledgeNode, SourceType, UserActivity } from "@agentmesh/shared-types";

export interface ExtractedKnowledge {
	title: string;
	content: string;
	categoryId: string;
	sourceType: SourceType;
	confidence: number;
	metadata?: Record<string, unknown>;
}

/**
 * Simple knowledge extractor.
 * Production: use LLM to extract structured knowledge from activity.
 */
export class KnowledgeExtractor {
	async extract(params: {
		content: string;
		category: CategoryContext;
		sourceType?: SourceType;
	}): Promise<ExtractedKnowledge> {
		const { content, category, sourceType = "conversation" } = params;

		// Naive title generation
		const title = content.length > 80 ? `${content.slice(0, 77)}...` : content;

		return {
			title,
			content,
			categoryId: category.subdomain ? `${category.domain}.${category.subdomain}` : category.domain,
			sourceType,
			confidence: 0.7,
			metadata: {
				jurisdiction: category.jurisdiction,
				task: category.task,
				riskLevel: category.riskLevel,
			},
		};
	}
}

export const knowledgeExtractor = new KnowledgeExtractor();

export function toKnowledgeNode(ownerId: string, extracted: ExtractedKnowledge): KnowledgeNode {
	const now = new Date();
	return {
		id: `kn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
		ownerId,
		categoryId: extracted.categoryId,
		title: extracted.title,
		content: extracted.content,
		sourceType: extracted.sourceType,
		visibility: "private",
		permissions: createDefaultPermissions(ownerId),
		confidence: extracted.confidence,
		createdAt: now,
		updatedAt: now,
		metadata: extracted.metadata,
	};
}

export async function processUserActivity(
	activity: UserActivity,
	classify: (text: string) => Promise<CategoryContext>,
	upsert: (ownerId: string, node: KnowledgeNode) => Promise<void>,
	connectGraph?: (params: {
		userId: string;
		category: CategoryContext;
		knowledge: KnowledgeNode;
	}) => Promise<void>,
): Promise<KnowledgeNode | null> {
	if (!activity.content || activity.content.trim().length < 10) {
		return null;
	}

	const category = await classify(activity.content);
	const extracted = await knowledgeExtractor.extract({
		content: activity.content,
		category,
		sourceType:
			activity.type === "document"
				? "document"
				: activity.type === "feedback"
					? "experience"
					: "conversation",
	});

	const node = toKnowledgeNode(activity.userId, extracted);
	await upsert(activity.userId, node);

	if (connectGraph) {
		await connectGraph({
			userId: activity.userId,
			category,
			knowledge: node,
		});
	}

	return node;
}
