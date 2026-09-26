/**
 * Source-model-aware consensus (Phase C3).
 *
 * Mirrors Bitterbot's "skill proven by diverse execution" idea: when the
 * cast fans a request out to several agents, the agreement between
 * agents backed by *different models* is more trustworthy than agreement
 * between agents backed by the same model.
 *
 * Usage:
 *
 *   - `weightedConsensus(results)` — picks the highest weighted score,
 *     where weight = `confidence × (1 + log(1 + distinctModels))`.
 *   - `groupByAnswer(results)` — diagnostic helper that returns one row
 *     per distinct answer, with the set of distinct model ids that
 *     voted for it.
 *
 * The function deliberately does not invent model identities: it reads
 * them off `result.metadata?.modelId`. Callers that have richer model
 * info can stash it there once the recursive cast completes.
 */

import type { AgentResult } from "@agentmesh/core";

export interface ConsensusRow {
	answer: string;
	count: number;
	distinctModels: string[];
	weight: number;
	confidence: number;
	result: AgentResult;
}

export function groupByAnswer(results: AgentResult[]): ConsensusRow[] {
	const groups = new Map<string, ConsensusRow>();
	for (const result of results) {
		if (result.error) continue;
		const existing = groups.get(result.answer);
		const modelId = readModelId(result);
		if (!existing) {
			groups.set(result.answer, {
				answer: result.answer,
				count: 1,
				distinctModels: modelId ? [modelId] : [],
				weight: result.confidence,
				confidence: result.confidence,
				result,
			});
			continue;
		}
		existing.count += 1;
		existing.weight += result.confidence;
		existing.confidence += result.confidence;
		if (modelId && !existing.distinctModels.includes(modelId)) {
			existing.distinctModels.push(modelId);
		}
	}
	return [...groups.values()];
}

export function weightedConsensus(results: AgentResult[]): AgentResult | undefined {
	const rows = groupByAnswer(results);
	if (rows.length === 0) return undefined;

	// weight = sum(confidence) × diversity bonus
	const scored = rows.map((row) => ({
		row,
		score: row.weight * (1 + Math.log(1 + row.distinctModels.length)),
	}));
	scored.sort((a, b) => b.score - a.score);
	return scored[0]?.row.result;
}

function readModelId(result: AgentResult): string | undefined {
	const metadata = result.metadata;
	if (!metadata || typeof metadata !== "object") return undefined;
	const modelId = (metadata as { modelId?: unknown }).modelId;
	return typeof modelId === "string" && modelId.length > 0 ? modelId : undefined;
}
