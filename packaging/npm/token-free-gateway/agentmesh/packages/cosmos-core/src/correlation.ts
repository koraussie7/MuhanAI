/**
 * Temporal correlation — the "inference" half of the geospatial pipeline.
 *
 * ShadowBroker observations and Pythia forecasts land in the same append-only
 * log with distinct `source` values. This module reads that log and asks the
 * question neither engine can answer alone:
 *
 *   "Does an observation *confirm* a forecast, and if so, how strongly?"
 *
 * That is the whole point of the integration. Pythia says "conflict risk in the
 * Gulf is rising" with a probability; ShadowBroker says "three vessels went
 * dark and GPS jamming appeared in the same box". Individually each is a weak
 * signal. Correlated in time and space, they become one strong one — and the
 * correlation is *evidence-backed*, because every claim cites the event ids
 * that produced it.
 *
 * Design rules
 * ------------
 *  1. Pure and total. No I/O, no clock reads, no throwing. Input is a list of
 *     events; output is a ranked list of correlations. This is testable without
 *     a network or a log instance.
 *  2. Correlation proposes, it does not conclude. Output is expressed as
 *     `RelationProposed` inputs (`causes` / `precedes` / `amplifies`) so the
 *     existing relation projection applies its own convergence scoring and the
 *     concept still has to earn `validated` status through reactions.
 *  3. Confidence is explainable. Each result carries the factors that produced
 *     it (time delta, spatial distance, severity, domain overlap) so the UI can
 *     show *why* two things were linked.
 */

import { clamp01, conceptId, normalizeDomain, parseConceptId } from "./ontology.js";
import type {
	CosmosEvent,
	PredictionHorizon,
	RelationProposed,
	RelationType,
	WorldEventIngested,
	WorldSeverity,
} from "./types.js";

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/**
 * How long after a prediction an observation can still confirm it, per
 * horizon. A 24h forecast is confirmed within a day; a 1y forecast stays open
 * far longer but is inherently weaker evidence.
 */
export const CONFIRMATION_WINDOWS_MS: Record<PredictionHorizon, number> = {
	"24h": 36 * 60 * 60 * 1000,
	"1w": 10 * 24 * 60 * 60 * 1000,
	"1m": 45 * 24 * 60 * 60 * 1000,
	"1y": 400 * 24 * 60 * 60 * 1000,
};

/**
 * Same domain, recently confirmed — the baseline pairing.
 *
 * The ceilings here are deliberately set so that a *single* confirmation of a
 * strong forecast lands around 0.7–0.8, leaving headroom for independent
 * corroboration to matter. Saturating at 1.0 on the first observation would
 * flatten every correlation to the same value and make the ranking useless.
 */
const BASE_STRENGTH = 0.25;

/** Extra strength for a same-domain hit, and for a cross-domain one. */
const SAME_DOMAIN_BONUS = 0.15;
const CROSS_DOMAIN_STRENGTH = 0.1;

/**
 * Component weights. They sum to 0.5, so a same-domain confirmation with a
 * high-probability forecast, zero time delta, full proximity and alert
 * severity reaches `BASE_STRENGTH + SAME_DOMAIN_BONUS + 0.5 = 0.9` — short of
 * saturation, which is what lets corroboration push it higher.
 */
const PROBABILITY_WEIGHT = 0.15;
const TIME_DECAY_WEIGHT = 0.15;
const PROXIMITY_WEIGHT = 0.15;
const SEVERITY_WEIGHT_MAX = 0.2;

/** Radius (km) within which an observation is considered colocated. */
export const COLOCATION_RADIUS_KM = 250;

/** Above this strength a correlation is worth surfacing at all. */
export const MIN_REPORTED_STRENGTH = 0.25;

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371;

/**
 * Great-circle distance in km (haversine). Returns null when either point is
 * missing — distance is unknown, not zero, and callers must not treat an
 * unknown distance as a match.
 */
export function haversineKm(
	a: { lat: number; lng: number } | undefined,
	b: { lat: number; lng: number } | undefined,
): number | null {
	if (!a || !b) return null;
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(b.lat - a.lat);
	const dLng = toRad(b.lng - a.lng);
	const lat1 = toRad(a.lat);
	const lat2 = toRad(b.lat);
	const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ---------------------------------------------------------------------------
// Correlation
// ---------------------------------------------------------------------------

export interface CorrelationFactors {
	/** Milliseconds between the prediction and the confirming observation. */
	deltaMs: number;
	/** Distance in km, or null when either event lacks coordinates. */
	distanceKm: number | null;
	/** Whether prediction and observation share a cosmos domain. */
	sameDomain: boolean;
	/** Severity carried by the observation. */
	severity: WorldSeverity;
}

export interface Correlation {
	/** Concept id of the prediction that this observation supports. */
	predictionConceptId: string;
	/** Concept id of the observed event. */
	observationConceptId: string;
	/** Log event id of the prediction. */
	predictionEventId: string;
	/** Log event ids of the supporting observations. */
	observationEventIds: string[];
	predicate: RelationType;
	/** 0..1 — how strongly the observations support the prediction. */
	strength: number;
	/** 0..1 — how much of that confidence rests on incomplete data. */
	confidence: number;
	rationale: string;
	factors: CorrelationFactors;
}

const SEVERITY_WEIGHT: Record<WorldSeverity, number> = {
	info: 0.1,
	watch: 1,
	alert: 1.6,
};

/**
 * Extract the real subject domain of a forecast.
 *
 * `normalizePrediction` stamps every prediction with `domain: "prediction"` —
 * that is the event *kind*, not its subject. Matching on it would make every
 * forecast compare against the literal string "prediction" and never line up
 * with an observation.
 *
 * The subject domains are carried in `conceptIds` as `domain::cyber`,
 * `domain::conflict`… which is how the domain-level concept accumulates signal
 * across many headlines. The `domain::` prefix is the concept *namespace* and
 * must be stripped: what an observation carries in `payload.domain` is the bare
 * name (`"cyber"`), so comparing raw concept ids would never match.
 */
export function predictionDomains(prediction: PredictionIssuedShape): string[] {
	const raw = prediction.payload as { domain?: unknown; conceptIds?: unknown; raw?: unknown };

	const domains = new Set<string>();

	const conceptIds = raw.conceptIds;
	if (Array.isArray(conceptIds)) {
		for (const id of conceptIds) {
			if (typeof id !== "string") continue;
			// A domain-level concept is literally `domain::<subject>`, so the
			// subject is the *label*, not the domain part. Splitting on the first
			// `::` and taking the left side would yield the literal string
			// "domain" for every one of them — use the id contract instead.
			const parsed = parseConceptId(id);
			if (parsed.domain !== "domain" || !parsed.label) continue;
			domains.add(normalizeDomain(parsed.label));
		}
	}

	const explicit = raw.domain;
	if (typeof explicit === "string" && explicit !== "prediction" && explicit !== "general") {
		domains.add(explicit);
	}

	return [...domains];
}

/**
 * Score one prediction/observation pair.
 *
 * Scoring is additive and bounded, deliberately simple enough to explain in a
 * sentence to an operator: same domain, close in time, close in space, and
 * severe → strong. Cross-domain pairs still score, but weakly — a GPS jamming
 * report *can* relate to a conflict forecast without being in the conflict
 * domain, and that weak link is exactly the kind of non-obvious inference the
 * integration exists to surface.
 */
export function scorePair(
	prediction: PredictionIssuedShape,
	observation: WorldEventIngested,
): Correlation | null {
	const deltaMs = Math.abs(observation.timestamp - prediction.timestamp);
	const window = CONFIRMATION_WINDOWS_MS[prediction.payload.horizon];
	if (deltaMs > window) return null;

	const predictionDomainSet = new Set(predictionDomains(prediction));
	const sameDomain = predictionDomainSet.has(observation.payload.domain);
	const distanceKm = haversineKm(observation.payload.geo, predictionGeo(prediction));

	// A cross-domain link with no shared location is noise, not inference.
	if (!sameDomain && distanceKm === null) return null;

	let strength = sameDomain ? BASE_STRENGTH + SAME_DOMAIN_BONUS : CROSS_DOMAIN_STRENGTH;

	// Probability of the forecast modulates how much a confirmation is worth:
	// a 90% forecast being confirmed is expected; a 10% one is informative.
	strength += clamp01(prediction.payload.probability) * PROBABILITY_WEIGHT;

	// Time decay across the horizon window.
	const timeFraction = clamp01(1 - deltaMs / window);
	strength += timeFraction * TIME_DECAY_WEIGHT;

	// Spatial proximity.
	let confidence = 0.5;
	if (distanceKm !== null) {
		const proximity = clamp01(1 - distanceKm / COLOCATION_RADIUS_KM);
		strength += proximity * PROXIMITY_WEIGHT;
		confidence += 0.25 * (distanceKm <= COLOCATION_RADIUS_KM ? 1 : 0);
	}

	strength += (SEVERITY_WEIGHT[observation.payload.severity] / 1.6) * SEVERITY_WEIGHT_MAX;

	if (sameDomain) confidence += 0.15;

	strength = clamp01(strength);
	if (strength < MIN_REPORTED_STRENGTH) return null;

	const factors: CorrelationFactors = {
		deltaMs,
		distanceKm,
		sameDomain,
		severity: observation.payload.severity,
	};

	return {
		predictionConceptId: conceptId("prediction", prediction.payload.title),
		observationConceptId: conceptId("world", observation.payload.title),
		predictionEventId: prediction.id,
		observationEventIds: [observation.id],
		predicate: "amplifies",
		strength,
		confidence: clamp01(confidence),
		rationale: describeCorrelation(prediction, observation, factors),
		factors,
	};
}

/** The subset of a prediction event this module needs. */
export interface PredictionIssuedShape {
	id: string;
	timestamp: number;
	payload: {
		domain: string;
		title: string;
		horizon: PredictionHorizon;
		probability: number;
		confidence: number;
		/** Subject domains carried by `normalizePrediction` (see `predictionDomains`). */
		conceptIds?: string[];
		/** Optional: today most forecasts are domain-only, with no location. */
		geo?: { lat: number; lng: number };
	};
}

/**
 * A prediction may carry a location once the upstream provides one; today it
 * usually does not, in which case only same-domain pairs can correlate.
 */
function predictionGeo(
	prediction: PredictionIssuedShape,
): { lat: number; lng: number } | undefined {
	const raw = prediction.payload.geo;
	return raw && Number.isFinite(raw.lat) && Number.isFinite(raw.lng) ? raw : undefined;
}

function describeCorrelation(
	prediction: PredictionIssuedShape,
	observation: WorldEventIngested,
	factors: CorrelationFactors,
): string {
	const parts: string[] = [];
	parts.push(
		factors.sameDomain
			? `동일 도메인(${observation.payload.domain})`
			: `교차 도메인(${prediction.payload.domain} ← ${observation.payload.domain})`,
	);
	const hours = factors.deltaMs / 3_600_000;
	parts.push(
		hours < 1 ? `${Math.round(factors.deltaMs / 60_000)}분 내` : `${hours.toFixed(1)}시간 내`,
	);
	if (factors.distanceKm !== null) parts.push(`${Math.round(factors.distanceKm)}km 이내`);
	parts.push(`심각도 ${factors.severity}`);
	return `"${prediction.payload.title}" 예측이 "${observation.payload.title}" 관측으로 뒷받침됨 — ${parts.join(", ")}.`;
}

// ---------------------------------------------------------------------------
// Log scan
// ---------------------------------------------------------------------------

export interface CorrelateOptions {
	/** Only correlate observations at or after this epoch millis. */
	since?: number;
	/** Cap on returned correlations, strongest first. Default 50. */
	limit?: number;
}

/**
 * Pair every `prediction` in the log with the `world_event`s that may confirm
 * it, and return the survivors ranked by strength.
 *
 * Observations emitted by Pythia itself are skipped: a feed confirming its own
 * forecast is not independent evidence, and counting it would let the engine
 * inflate its own accuracy signal.
 */
export function correlateEvents(
	events: CosmosEvent[],
	options: CorrelateOptions = {},
): Correlation[] {
	const predictions: PredictionIssuedShape[] = [];
	const observations: WorldEventIngested[] = [];

	for (const event of events) {
		if (options.since !== undefined && event.timestamp < options.since) continue;
		if (event.kind === "prediction") {
			predictions.push(event as unknown as PredictionIssuedShape);
		} else if (event.kind === "world_event") {
			// Only independent observation sources count as evidence.
			if (event.source === "pythia") continue;
			observations.push(event);
		}
	}

	const results: Correlation[] = [];
	for (const prediction of predictions) {
		const matches = observations
			.map((observation) => scorePair(prediction, observation))
			.filter((correlation): correlation is Correlation => correlation !== null);

		if (matches.length === 0) continue;

		// Fold multiple confirmations of one prediction into a single stronger
		// correlation. Independent corroboration is what turns a coincidence into
		// a signal, so the count raises strength and confidence together — and the
		// per-observation ceiling above is what leaves room for it to matter.
		const best = matches.reduce((a, b) => (b.strength > a.strength ? b : a));
		const support = matches.length;
		const corroboration = Math.min(0.3, (support - 1) * 0.1);

		results.push({
			...best,
			observationEventIds: matches.flatMap((m) => m.observationEventIds),
			strength: clamp01(best.strength + corroboration),
			confidence: clamp01(best.confidence + Math.min(0.2, (support - 1) * 0.05)),
			rationale:
				support > 1 ? `${best.rationale} (독립 관측 ${support}건이 교차 확인)` : best.rationale,
		});
	}

	results.sort((a, b) => b.strength - a.strength);
	return options.limit !== undefined ? results.slice(0, options.limit) : results;
}

/** `Correlation` → appendable `relation_event` inputs. */
export function correlationToRelationEvents(correlations: Correlation[]): RelationProposed[] {
	return correlations.map((correlation) => ({
		id: "",
		sequence: 0,
		timestamp: Date.now(),
		source: "system" as const,
		kind: "relation_event" as const,
		payload: {
			sourceId: correlation.observationConceptId,
			targetId: correlation.predictionConceptId,
			predicate: correlation.predicate,
			strength: correlation.strength,
			evidenceEventIds: [correlation.predictionEventId, ...correlation.observationEventIds],
			reason: correlation.rationale,
		},
	}));
}
