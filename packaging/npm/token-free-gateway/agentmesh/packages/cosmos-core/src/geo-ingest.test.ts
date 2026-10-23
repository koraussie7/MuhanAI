/**
 * Geo metadata pipeline tests - world feed events carrying a GeoJSON point
 * must land as coordinates on the projected concept (OntologyConcept.metadata),
 * so the /api/ontograph sidebar can fly the globe to a selection.
 */
import { describe, expect, it } from "vitest";
import { createMemoryLog } from "./log.js";
import { ingestWorldBrief } from "./ingest.js";
import { applyEvent, emptyProjection } from "./projections.js";
import type { CosmosEvent } from "./types.js";

describe("geo metadata pipeline", () => {
	const brief = {
		source: "pythia" as const,
		summary: "test",
		domains: ["weather"],
		events: [
			{
				id: "evt-geo-1",
				title: "Flood alert issued",
				domain: "weather",
				location: "Seoul, KR",
				severity: "watch" as const,
				source: "pythia",
				timestamp: "2026-10-22T00:00:00Z",
				geo: { lat: 37.5665, lng: 126.978 },
			},
		],
		predictions: [],
		fetchedAt: "2026-10-22T00:00:00Z",
	};

	it("the first ontology_node event carries the geo metadata", async () => {
		const log = createMemoryLog();
		const result = await ingestWorldBrief(log, brief);
		expect(result.appended.length).toBeGreaterThan(0);
		const geoEvents = result.appended.filter(
			(e) =>
				e.kind === "ontology_node" &&
				(e.payload as { metadata?: unknown }).metadata !== undefined,
		);
		expect(geoEvents.length).toBeGreaterThan(0);
		const firstGeo = geoEvents[0];
		if (!firstGeo) throw new Error("geo event missing");
		const meta = (firstGeo.payload as { metadata?: { geo?: { lat: number; lng: number } } })
			.metadata;
		if (!meta?.geo) throw new Error("geo metadata missing");
		expect(meta.geo.lat).toBe(37.5665);
		expect(meta.geo.lng).toBe(126.978);
	});

	it("the projection persists coordinates on the concept", async () => {
		const log = createMemoryLog();
		await ingestWorldBrief(log, brief);
		const projection = emptyProjection();
		for (const event of await log.tail(1000)) applyEvent(projection, event);
		const withGeo = [...projection.concepts.values()].filter(
			(c) => c.metadata?.geo !== undefined,
		);
		expect(withGeo.length).toBeGreaterThan(0);
		const first = withGeo[0];
		if (!first) throw new Error("geo concept missing");
		expect(first.metadata).toEqual({ geo: { lat: 37.5665, lng: 126.978 } });
	});

	it("re-observing an existing concept backfills missing coordinates", () => {
		const projection = emptyProjection();
		const first: CosmosEvent = {
			id: "e1",
			sequence: 1,
			timestamp: 1_000,
			source: "pythia",
			kind: "ontology_node",
			payload: { conceptId: "geo::tokyo", label: "Tokyo", domain: "geo", status: "raw" },
		};
		const second: CosmosEvent = {
			id: "e2",
			sequence: 2,
			timestamp: 2_000,
			source: "pythia",
			kind: "ontology_node",
			payload: {
				conceptId: "geo::tokyo",
				label: "Tokyo",
				domain: "geo",
				status: "raw",
				metadata: { geo: { lat: 35.6762, lng: 139.6503 } },
			},
		};
		applyEvent(projection, first);
		applyEvent(projection, second);
		expect(projection.concepts.get("geo::tokyo")?.metadata).toEqual({
			geo: { lat: 35.6762, lng: 139.6503 },
		});
	});
});
