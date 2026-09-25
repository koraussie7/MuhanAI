/**
 * ShadowBroker adapter + temporal correlation tests.
 *
 * These exercise the pure half of the geospatial pipeline — no network, no log
 * instance, no clock reads. The value being tested is the *mapping*: a noisy
 * 40-layer upstream becomes world-feed events whose domains line up with
 * Pythia's, so correlation has something to match on.
 */

import { describe, expect, it } from "vitest";
import { correlateEvents, haversineKm } from "./correlation.js";
import { mapTelemetryBrief } from "./shadowbroker.js";
import type { CosmosEvent, WorldEventIngested } from "./types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const T0 = Date.parse("2026-03-01T00:00:00.000Z");

function worldEvent(overrides: {
	id?: string;
	sequence?: number;
	timestamp?: number;
	source?: CosmosEvent["source"];
	payload?: Partial<WorldEventIngested["payload"]>;
} = {}): CosmosEvent {
	const base: WorldEventIngested = {
		id: "evt-1",
		sequence: 1,
		timestamp: T0,
		source: "shadowbroker",
		kind: "world_event",
		payload: {
			domain: "cyber",
			title: "GPS jamming detected",
			severity: "alert",
			upstreamId: "shadowbroker:gps_jamming:1",
			conceptIds: ["world::GPS jamming detected", "domain::cyber"],
		},
	};

	const { payload, ...rest } = overrides;
	return {
		...base,
		...rest,
		payload: { ...base.payload, ...payload },
	} as CosmosEvent;
}

function predictionEvent(overrides: {
	id?: string;
	timestamp?: number;
	domain?: string;
	horizon?: "24h" | "1w" | "1m" | "1y";
	conceptIds?: string[];
	geo?: { lat: number; lng: number };
} = {}): CosmosEvent {
	const { domain, conceptIds, geo, ...rest } = overrides;

	const payload: Record<string, unknown> = {
		domain: "prediction",
		title: "Gulf conflict risk rising",
		horizon: overrides.horizon ?? "24h",
		probability: 0.7,
		confidence: 0.8,
		rationale: "Vessel dark activity and jamming cluster",
		upstreamId: "pred-abc",
		// `normalizePrediction` pins `domain` to the event *kind* and carries the
		// forecast's subject domains here instead, so correlation has something
		// to match an observation against.
		conceptIds: conceptIds ?? ["prediction::Gulf conflict risk rising", "domain::cyber"],
	};
	if (domain) payload.domain = domain;
	if (geo) payload.geo = geo;

	return {
		id: "pred-1",
		sequence: 2,
		timestamp: T0,
		source: "pythia",
		kind: "prediction",
		...rest,
		payload,
	} as CosmosEvent;
}

// ---------------------------------------------------------------------------
// mapTelemetryBrief — envelope tolerance
// ---------------------------------------------------------------------------

describe("mapTelemetryBrief", () => {
	it("accepts a { layers: {...} } grouped envelope", () => {
		const brief = mapTelemetryBrief(
			{
				layers: {
					aircraft: [{ id: "abc123", title: "KAL123" }],
					vessels: [{ id: "mmsi-1", title: "Cargo ship" }],
				},
			},
			{ now: T0 },
		);

		expect(brief.source).toBe("shadowbroker");
		expect(brief.events).toHaveLength(2);
		expect(brief.domains).toEqual(["aviation", "maritime"]);
	});

	it("accepts a bare array, inferring the layer from each record", () => {
		const brief = mapTelemetryBrief(
			[
				{ layer: "satellites", id: "sat-1", title: "ISS pass" },
				{ layer: "earthquakes", id: "quake-1", title: "M5.2 offshore" },
			],
			{ now: T0 },
		);

		expect(brief.events).toHaveLength(2);
		expect(brief.events[1]?.severity).toBe("alert");
	});

	it("returns an empty brief for unrecognised input instead of throwing", () => {
		const brief = mapTelemetryBrief("not-a-payload", { now: T0 });

		expect(brief.events).toEqual([]);
		expect(brief.predictions).toEqual([]);
		expect(brief.summary).toContain("no observations");
	});

	it("namespaces ids by layer so equal upstream ids do not collide", () => {
		const brief = mapTelemetryBrief(
			{ layers: { aircraft: [{ id: "X1" }], vessels: [{ id: "X1" }] } },
			{ now: T0 },
		);

		const ids = brief.events.map((event) => event.id);
		expect(new Set(ids).size).toBe(2);
	});

	it("emits no predictions — ShadowBroker observes, it does not forecast", () => {
		const brief = mapTelemetryBrief({ layers: { aircraft: [{ id: "a" }] } }, { now: T0 });

		expect(brief.predictions).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Severity — escalate, never de-escalate
// ---------------------------------------------------------------------------

describe("severity floors", () => {
	it("keeps a jamming fix at alert even when upstream says info", () => {
		const brief = mapTelemetryBrief(
			{ layers: { gps_jamming: [{ id: "j1", title: "jamming", severity: "info" }] } },
			{ now: T0 },
		);

		expect(brief.events[0]?.severity).toBe("alert");
	});

	it("escalates an ordinary aircraft record when the item is flagged", () => {
		const brief = mapTelemetryBrief({ layers: { aircraft: [{ id: "a1", title: "squawk 7700" }] } }, {
			now: T0,
			isAnomalous: () => true,
		});

		expect(brief.events[0]?.severity).toBe("watch");
	});
});

// ---------------------------------------------------------------------------
// correlateEvents — observation × forecast
// ---------------------------------------------------------------------------

describe("correlateEvents", () => {
	it("links a same-domain observation to a forecast inside its window", () => {
		// Same subject domain (`domain::cyber` on the forecast, `cyber` on the
		// observation) is the baseline pairing. The forecast's own
		// `payload.domain` is pinned to "prediction", so this match can only
		// come from `conceptIds` — which is exactly the case being proven.
		const correlations = correlateEvents([predictionEvent(), worldEvent()]);

		expect(correlations).toHaveLength(1);
		expect(correlations[0]?.predictionEventId).toBe("pred-1");
		expect(correlations[0]?.observationEventIds).toContain("evt-1");
		expect(correlations[0]?.factors.sameDomain).toBe(true);
	});

	it("ignores an observation outside the forecast's confirmation window", () => {
		// A 24h forecast is confirmed within 36h; 40 days later it is stale.
		const stale = worldEvent({
			timestamp: T0 + 40 * 24 * 60 * 60 * 1000,
		} as Partial<WorldEventIngested>);

		expect(correlateEvents([predictionEvent(), stale])).toEqual([]);
	});

	it("never counts a Pythia observation as evidence for a Pythia forecast", () => {
		// A feed confirming its own forecast is not independent evidence.
		const selfConfirming = worldEvent({ source: "pythia" });

		expect(correlateEvents([predictionEvent(), selfConfirming])).toEqual([]);
	});

	it("drops a cross-domain pair that shares no location — that is noise", () => {
		// Forecast subject is `cyber` and observation domain is `maritime`, with
		// no coordinates on either side: nothing left to correlate on.
		const unrelated = worldEvent({
			payload: {
				domain: "maritime",
				title: "Cargo ship departed",
				severity: "info",
				upstreamId: "shadowbroker:vessels:9",
				conceptIds: ["world::Cargo ship departed", "domain::maritime"],
			},
		});

		expect(correlateEvents([predictionEvent(), unrelated])).toEqual([]);
	});

	it("keeps a cross-domain pair when both sides have coordinates in range", () => {
		// `conflict` forecast vs. `cyber` observation — a GPS jamming report can
		// relate to a conflict forecast without sitting in the conflict domain.
		// Shared location is what makes that link non-obvious but real.
		const prediction = predictionEvent({
			conceptIds: ["prediction::Gulf conflict risk rising", "domain::conflict"],
			geo: { lat: 26.5, lng: 56.2 },
		});

		const observation = worldEvent({
			payload: {
				domain: "cyber",
				title: "GPS jamming detected",
				severity: "alert",
				upstreamId: "shadowbroker:gps_jamming:1",
				conceptIds: ["world::GPS jamming detected", "domain::cyber"],
				geo: { lat: 26.6, lng: 56.3 },
			},
		});

		const correlations = correlateEvents([prediction, observation]);

		expect(correlations).toHaveLength(1);
		expect(correlations[0]?.factors.sameDomain).toBe(false);
		expect(correlations[0]?.factors.distanceKm).toBeLessThan(250);
	});

	it("never pairs two forecasts, or two observations with each other", () => {
		const correlations = correlateEvents([predictionEvent(), worldEvent()]);

		for (const correlation of correlations) {
			const ids = [correlation.predictionEventId, ...correlation.observationEventIds];
			expect(ids).toContain("pred-1");
			expect(ids).toContain("evt-1");
		}
	});

	it("explains its strength with the factors that produced it", () => {
		const correlations = correlateEvents([predictionEvent(), worldEvent()]);

		expect(correlations[0]?.factors.sameDomain).toBe(true);
		expect(correlations[0]?.factors.severity).toBe("alert");
		expect(correlations[0]?.rationale).toContain("뒷받침됨");
	});

	it("honours the `since` lower bound", () => {
		expect(correlateEvents([predictionEvent(), worldEvent()], { since: T0 + 1 })).toEqual([]);
	});

	it("folds multiple confirmations of one forecast into a stronger single link", () => {
		const second = worldEvent({ id: "evt-2", sequence: 3 });

		const single = correlateEvents([predictionEvent(), worldEvent()]);
		const doubled = correlateEvents([predictionEvent(), worldEvent(), second]);

		expect(doubled[0]?.observationEventIds).toHaveLength(2);
		expect(doubled[0]?.strength).toBeGreaterThan(single[0]?.strength ?? 0);
	});

	it("returns an empty list for an empty log", () => {
		expect(correlateEvents([])).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

describe("haversineKm", () => {
	it("returns null when either point is missing — unknown is not zero", () => {
		expect(haversineKm(undefined, { lat: 0, lng: 0 })).toBeNull();
		expect(haversineKm({ lat: 0, lng: 0 }, undefined)).toBeNull();
	});

	it("measures a known separation within a few percent", () => {
		// Seoul → Busan is roughly 325 km great-circle.
		const km = haversineKm({ lat: 37.5665, lng: 126.978 }, { lat: 35.1796, lng: 129.0756 });

		expect(km).toBeGreaterThan(300);
		expect(km).toBeLessThan(350);
	});
});