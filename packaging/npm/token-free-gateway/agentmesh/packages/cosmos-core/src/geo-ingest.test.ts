/**
 * Geo metadata pipeline tests — world feed location strings must land as
 * coordinates on the projected concept, so the /api/ontograph sidebar can
 * fly the globe to a selection.
 */
import { describe, expect, it } from "vitest";
import { createMemoryLog, conceptId } from "./index.js";
import { geoForLocation, ingestWorldBrief } from "./ingest.js";
import { applyEvent, emptyProjection } from "./projections.js";
import type { CosmosEvent } from "./types.js";
describe("geoForLocation", () => {
	it("resolves known cities case-insensitively, including substrings", () => {
		expect(geoForLocation("Seoul, KR")).toEqual({ latitude: 37.5665, longitude: 126.978 });
		expect(geoForLocation("heavy rain near Tokyo Bay")).toEqual({
			latitude: 35.6762,
			longitude: 139.6503,
		});
	});
	it("returns null for unknown or missing locations", () => {
		expect(geoForLocation("nowhereville")).toBeNull();
		expect(geoForLocation(undefined)).toBeNull();
	});
});
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
			},
		],
		predictions: [],
		fetchedAt: "2026-10-22T00:00:00Z",
	};
	it("ingestWorldBrief appends ontology_node events carrying geo metadata", async () => {
		const log = await createMemoryLog();
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
		const meta = (firstGeo.payload as { metadata: Record<string, number> }).metadata;
		if (!meta) throw new Error("geo metadata missing");
		expect(meta.latitude).toBe(37.5665);
		expect(meta.longitude).toBe(126.978);
	});
	it("the projection persists coordinates on the concept", async () => {
		const log = await createMemoryLog();
		await ingestWorldBrief(log, brief);
		const projection = emptyProjection();
		for (const event of await log.tail(100)) applyEvent(projection, event as CosmosEvent);
		const seoulConcept = projection.concepts.get(conceptId("world", "Flood alert issued"));
		// The event concept (domain `world`) and the domain concept both exist;
		// every concept touched by a located event carries the coordinates.
		expect(seoulConcept).toBeDefined();
		expect(seoulConcept?.metadata).toEqual({ latitude: 37.5665, longitude: 126.978 });
		const anyGeo = [...projection.concepts.values()].find((c) => c.metadata?.latitude !== undefined);
		expect(anyGeo).toBeDefined();
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
				metadata: { latitude: 35.6762, longitude: 139.6503 },
			},
		};
		applyEvent(projection, first);
		applyEvent(projection, second);
		expect(projection.concepts.get("geo::tokyo")?.metadata).toEqual({
			latitude: 35.6762,
			longitude: 139.6503,
		});
	});
});
