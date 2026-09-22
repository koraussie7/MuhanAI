/**
 * Amplification — turning recorded reactions into a 0..1 significance score.
 *
 * This is the mechanism behind "meaningful information is distilled from raw
 * feed noise": nothing is amplified by the feed itself, only by people and
 * agents reacting to it. A concept nothing touches stays at zero forever.
 *
 * The signals are intentionally additive-with-cap rather than a learned model,
 * so the score is explainable: every contributing signal is reported back in
 * `AmplificationBreakdown.signals`.
 */

import { clamp01 } from "./ontology.js";
import type { ReactionType, SignalType } from "./types.js";

/** Weights are tunable constants; keep them summed to 1 for a normalized score. */
export const SIGNAL_WEIGHTS: Record<SignalType, number> = {
	reaction_volume: 0.3,
	reaction_strength: 0.2,
	cross_agent: 0.2,
	temporal_clustering: 0.12,
	relation_convergence: 0.1,
	citations: 0.05,
	prediction_accuracy: 0.03,
};

/** How much each reaction verb counts toward `reaction_strength`. */
export const REACTION_STRENGTH: Record<ReactionType, number> = {
	confirm: 1,
	deny: 0.9,
	correct: 0.8,
	connect_suggest: 0.6,
	prioritize: 0.7,
	question: 0.5,
	note_attach: 0.4,
};

/** Volume at which `reaction_volume` saturates. */
export const VOLUME_SATURATION = 25;

/** Window (ms) used for `temporal_clustering`. */
export const CLUSTER_WINDOW_MS = 60 * 60 * 1000;

/** Minimum cluster size before clustering contributes. */
export const CLUSTER_MIN_SIZE = 3;

/** One recorded reaction, as projected from the log. */
export interface ReactionSample {
	reaction: ReactionType;
	actorId?: string;
	timestamp: number;
}

/** Inputs beyond reactions that also feed the score. */
export interface AmplificationInput {
	reactions: ReactionSample[];
	/** Distinct independent proposals supporting relations around this concept. */
	relationProposalCount?: number;
	/** How many other concepts reference this one (relations + citations). */
	citationCount?: number;
	/** 0..1 accuracy of predictions that referenced this concept. */
	predictionAccuracy?: number;
}


/** Largest share of reactions attributable to one actor, tempered by actor count. */
function crossAgentFactor(reactions: ReactionSample[]): number {
	if (reactions.length === 0) return 0;
	const perActor = new Map<string, number>();
	for (const sample of reactions) {
		const key = sample.actorId ?? "anonymous";
		perActor.set(key, (perActor.get(key) ?? 0) + 1);
	}
	const maxByOneActor = Math.max(...perActor.values());
	const spread = clamp01(1 - (maxByOneActor - 1) / reactions.length);
	const breadth = clamp01(perActor.size / 3);
	return spread * breadth;
}

/**
 * Dense-cluster factor: the share of reactions that sit inside some window of
 * `CLUSTER_WINDOW_MS`. A slow trickle scores low; a burst scores high.
 */
function temporalClusterFactor(reactions: ReactionSample[]): number {
	if (reactions.length < CLUSTER_MIN_SIZE) return 0;

	const sorted = [...reactions].sort((a, b) => a.timestamp - b.timestamp);
	let best = 0;
	let start = 0;

	for (let end = 0; end < sorted.length; end += 1) {
		while (
			start < end &&
			sorted[end]!.timestamp - sorted[start]!.timestamp > CLUSTER_WINDOW_MS
		) {
			start += 1;
		}
		best = Math.max(best, end - start + 1);
	}

	if (best < CLUSTER_MIN_SIZE) return 0;
	return clamp01(best / sorted.length) * clamp01(best / VOLUME_SATURATION);
}

/**
 * Compute the amplification breakdown for one concept.
 *
 * Pure and deterministic — same samples in, same score out. That property is
 * what makes the score re-derivable from the log at any time, so a projection
 * rebuild can never drift from what users saw.
 */
export function amplify(input: AmplificationInput): AmplificationBreakdown {
	const reactions = input.reactions ?? [];
	const contributions: Partial<Record<SignalType, number>> = {};

	const volume = clamp01(reactions.length / VOLUME_SATURATION);
	if (volume > 0) contributions.reaction_volume = volume * SIGNAL_WEIGHTS.reaction_volume;

	let strengthTotal = 0;
	for (const sample of reactions) strengthTotal += REACTION_STRENGTH[sample.reaction] ?? 0.5;
	const strength = reactions.length > 0 ? clamp01(strengthTotal / reactions.length) : 0;
	if (strength > 0) contributions.reaction_strength = strength * SIGNAL_WEIGHTS.reaction_strength;

	const crossAgent = crossAgentFactor(reactions);
	if (crossAgent > 0) contributions.cross_agent = crossAgent * SIGNAL_WEIGHTS.cross_agent;

	const clustering = temporalClusterFactor(reactions);
	if (clustering > 0) {
		contributions.temporal_clustering = clustering * SIGNAL_WEIGHTS.temporal_clustering;
	}

	const convergence = clamp01((input.relationProposalCount ?? 0) / 5);
	if (convergence > 0) {
		contributions.relation_convergence = convergence * SIGNAL_WEIGHTS.relation_convergence;
	}

	const citations = clamp01((input.citationCount ?? 0) / 10);
	if (citations > 0) contributions.citations = citations * SIGNAL_WEIGHTS.citations;

	const accuracy = clamp01(input.predictionAccuracy ?? 0);
	if (accuracy > 0) contributions.prediction_accuracy = accuracy * SIGNAL_WEIGHTS.prediction_accuracy;

	const signals = (Object.keys(contributions) as SignalType[])
		.filter((signal) => (contributions[signal] ?? 0) > 0)
		.sort(
			(a, b) =>
				(contributions[b] ?? 0) - (contributions[a] ?? 0) || a.localeCompare(b),
		);

	const total = signals.reduce((sum, signal) => sum + (contributions[signal] ?? 0), 0);

	return {
		signalScore: clamp01(total),
		contributions,
		signals,
	};
}

/**
 * Map a signal score onto the ontology lifecycle.
 *
 * `deprecated` is never produced here — only an explicit human/agent decision
 * retires a concept. Automated scores can promote, never delete.
 */
export function statusForScore(score: number): "raw" | "validated" | "amplified" {
	if (score >= 0.6) return "amplified";
	if (score >= 0.25) return "validated";
	return "raw";
}

export interface AmplificationBreakdown {
	/** Final clamped 0..1 significance score. */
	signalScore: number;
	/** Per-signal contributions (already weighted and clamped). */
	contributions: Partial<Record<SignalType, number>>;
	/** Signals that actually fired, strongest first. */
	signals: SignalType[];
}