/**
 * ShadowBroker adapter — geospatial OSINT → cosmic world feed.
 *
 * Upstream: github.com/BigBodyCobain/Shadowbroker (AGPL-3.0). It exposes 40+
 * keyless live layers (ADS-B aircraft, AIS vessels, satellites, GPS jamming,
 * quakes, wildfire, CCTV…) through a REST backend plus an HMAC-signed agentic
 * command channel with `search_telemetry` / `search_news` / `osint_lookup`.
 *
 * This module is deliberately transport-agnostic. It does not fetch anything:
 * `services/api/world-routes.ts` owns the HTTP call (timeouts, auth, retries)
 * and hands the raw payload in. That keeps `cosmos-core` dependency-free and
 * lets the mapping be unit-tested with plain objects, exactly like
 * `ingestWorldBrief` is.
 *
 * Mapping philosophy
 * ------------------
 * ShadowBroker answers "what is happening where right now" (observation).
 * Pythia answers "what happens next" (forecast). Both land in the same log but
 * keep distinct `source` values so temporal-correlation rules can match a
 * forecast against the observation that later confirms it.
 *
 * Every normalizer is total: an unknown layer or a malformed coordinate
 * degrades to a default rather than throwing, because a noisy feed must never
 * break ingestion.
 */

import type { WorldFeedBrief, WorldFeedEvent } from "./ingest.js";
import type { WorldSeverity } from "./types.js";

// ---------------------------------------------------------------------------
// Layer registry
// ---------------------------------------------------------------------------

/**
 * How a ShadowBroker layer maps onto the cosmic ontology.
 *
 * `domain` becomes the domain-level concept (`domain::aviation`), which is what
 * lets unrelated aircraft alerts accumulate signal together. `severityFloor`
 * keeps high-consequence layers from being under-reported by noisy upstream
 * severity fields — GPS jamming is always at least a `watch`.
 */
export interface ShadowBrokerLayerSpec {
	/** Cosmic domain concept this layer contributes to. */
	domain: string;
	/** Minimum severity this layer may ever carry. */
	severityFloor: WorldSeverity;
	/** Human label used when an upstream item has no title. */
	label: string;
}

/**
 * Layer id → ontology mapping. Keys are matched case-insensitively and accept
 * both the snake_case ids ShadowBroker documents and common aliases.
 */
export const SHADOWBROKER_LAYERS: Record<string, ShadowBrokerLayerSpec> = {
	aircraft: { domain: "aviation", severityFloor: "info", label: "Aircraft" },
	adsb: { domain: "aviation", severityFloor: "info", label: "Aircraft (ADS-B)" },
	// `/api/live-data` names its aircraft list `flights` (and separates military
	// traffic into `military_flights`), so both keys must map to aviation.
	flights: { domain: "aviation", severityFloor: "info", label: "Aircraft" },
	military_flights: { domain: "aviation", severityFloor: "watch", label: "Military aircraft" },
	tracked_flights: { domain: "aviation", severityFloor: "info", label: "Tracked aircraft" },
	vessels: { domain: "maritime", severityFloor: "info", label: "Vessel" },
	ais: { domain: "maritime", severityFloor: "info", label: "Vessel (AIS)" },
	ships: { domain: "maritime", severityFloor: "info", label: "Vessel" },
	satellite: { domain: "space", severityFloor: "info", label: "Satellite" },
	satellites: { domain: "space", severityFloor: "info", label: "Satellite" },
	gps_jamming: { domain: "cyber", severityFloor: "alert", label: "GPS jamming" },
	jamming: { domain: "cyber", severityFloor: "alert", label: "GPS jamming" },
	cyber: { domain: "cyber", severityFloor: "watch", label: "Cyber threat" },
	space_weather: { domain: "cyber", severityFloor: "watch", label: "Space weather" },
	internet_outages: { domain: "cyber", severityFloor: "watch", label: "Internet outage" },
	sigint: { domain: "cyber", severityFloor: "info", label: "SIGINT emitter" },
	earthquake: { domain: "disaster", severityFloor: "alert", label: "Earthquake" },
	earthquakes: { domain: "disaster", severityFloor: "alert", label: "Earthquake" },
	quakes: { domain: "disaster", severityFloor: "alert", label: "Earthquake" },
	wildfire: { domain: "disaster", severityFloor: "watch", label: "Wildfire" },
	firms_fires: { domain: "disaster", severityFloor: "watch", label: "Thermal fire" },
	fire: { domain: "disaster", severityFloor: "watch", label: "Fire" },
	sar: { domain: "disaster", severityFloor: "watch", label: "SAR ground change" },
	weather: { domain: "weather", severityFloor: "info", label: "Weather" },
	conflict: { domain: "conflict", severityFloor: "watch", label: "Conflict event" },
	news: { domain: "conflict", severityFloor: "info", label: "News event" },
	gdelt: { domain: "conflict", severityFloor: "watch", label: "GDELT event" },
	liveuamap: { domain: "conflict", severityFloor: "watch", label: "LiveUAMap event" },
	frontlines: { domain: "conflict", severityFloor: "watch", label: "Frontline" },
	cctv: { domain: "infrastructure", severityFloor: "info", label: "CCTV" },
	infrastructure: { domain: "infrastructure", severityFloor: "info", label: "Infrastructure" },
	mesh: { domain: "infrastructure", severityFloor: "info", label: "Mesh radio" },
	police: { domain: "infrastructure", severityFloor: "info", label: "Police scanner" },
	datacenters: { domain: "infrastructure", severityFloor: "info", label: "Datacenter" },
	military_bases: { domain: "infrastructure", severityFloor: "info", label: "Military base" },
	uavs: { domain: "aviation", severityFloor: "watch", label: "UAV" },
};

/** Fallback spec for a layer the registry does not know about. */
const UNKNOWN_LAYER: ShadowBrokerLayerSpec = {
	domain: "general",
	severityFloor: "info",
	label: "Geospatial event",
};

export function layerSpec(layer: unknown): ShadowBrokerLayerSpec {
	if (typeof layer !== "string") return UNKNOWN_LAYER;
	return SHADOWBROKER_LAYERS[layer.trim().toLowerCase()] ?? UNKNOWN_LAYER;
}

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<WorldSeverity, number> = { info: 0, watch: 1, alert: 2 };

/** Raise `value` to at least `floor` (`alert` > `watch` > `info`). */
export function applySeverityFloor(value: WorldSeverity, floor: WorldSeverity): WorldSeverity {
	return SEVERITY_RANK[value] >= SEVERITY_RANK[floor] ? value : floor;
}

function coerceSeverity(value: unknown): WorldSeverity {
	if (value === "alert" || value === "watch" || value === "info") return value;
	if (typeof value === "number") {
		if (value >= 4) return "alert";
		if (value >= 2) return "watch";
		return "info";
	}
	if (typeof value === "string") {
		const lowered = value.trim().toLowerCase();
		if (lowered === "alert" || lowered === "high" || lowered === "critical") return "alert";
		if (lowered === "watch" || lowered === "medium" || lowered === "elevated") return "watch";
	}
	return "info";
}

// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------

export interface GeoPoint {
	lat: number;
	lng: number;
	altitudeM?: number;
}

function finite(value: unknown): number | null {
	const num = typeof value === "number" ? value : Number(value);
	return Number.isFinite(num) ? num : null;
}

/**
 * Accept the several shapes ShadowBroker layers use for position:
 * `{ lat, lng }`, `{ latitude, longitude }`, `[lng, lat]` (GeoJSON order),
 * and nested `{ location: ... }` / `{ position: ... }` wrappers.
 *
 * GeoJSON order is `[lng, lat]` — getting it backwards silently relocates an
 * event to the wrong hemisphere, so arrays are only trusted when the second
 * element is a legal latitude.
 */
export function coerceGeoPoint(raw: Record<string, unknown>): GeoPoint | null {
	const candidates: unknown[] = [raw, raw.location, raw.position, raw.coordinates];
	for (const candidate of candidates) {
		if (Array.isArray(candidate)) {
			const lng = finite(candidate[0]);
			const lat = finite(candidate[1]);
			if (lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
				const alt = finite(candidate[2]);
				return alt === null ? { lat, lng } : { lat, lng, altitudeM: alt };
			}
			continue;
		}
		if (!candidate || typeof candidate !== "object") continue;
		const record = candidate as Record<string, unknown>;
		const lat = finite(record.lat ?? record.latitude);
		const lng = finite(record.lng ?? record.lon ?? record.longitude);
		if (lat === null || lng === null) continue;
		if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
		const alt = finite(record.altitude ?? record.alt ?? record.altitude_m);
		return alt === null ? { lat, lng } : { lat, lng, altitudeM: alt };
	}
	return null;
}

/** `"34.0500, -118.2500"` — what `WorldEvent.location` carries to the globe UI. */
export function formatGeoLocation(point: GeoPoint): string {
	return `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
}

// ---------------------------------------------------------------------------
// Telemetry mapping
// ---------------------------------------------------------------------------

/** One raw ShadowBroker telemetry item, as returned by `search_telemetry`. */
export interface ShadowBrokerTelemetryItem {
	[field: string]: unknown;
}

export interface ShadowBrokerMapOptions {
	/** Epoch millis override (tests). */
	now?: number;
	/**
	 * Anomaly predicate. Returns true when an observation deviates from its
	 * layer's normal behaviour (course deviation, transponder loss, jamming
	 * footprint, sudden clustering). Flagged items are raised to `watch`.
	 *
	 * This is supplied by the caller because "anomalous" is doctrine, not
	 * plumbing: an aircraft holding a pattern is normal, the same aircraft
	 * over a restricted zone is not.
	 */
	isAnomalous?: (item: ShadowBrokerTelemetryItem, layer: string) => boolean;
}

function firstString(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value === "string" && value.trim().length > 0) return value.trim();
		if (typeof value === "number" && Number.isFinite(value)) return String(value);
	}
	return undefined;
}

/**
 * One telemetry item → one `WorldFeedEvent`.
 *
 * Returns null when the item carries no usable identity at all, so that a
 * malformed row is dropped instead of polluting the log with an anonymous
 * "untitled" observation that would create a junk concept.
 */
export function mapTelemetryItem(
	item: ShadowBrokerTelemetryItem,
	layer: string,
	options: ShadowBrokerMapOptions = {},
): WorldFeedEvent | null {
	const spec = layerSpec(layer);
	const now = options.now ?? Date.now();
	const geo = coerceGeoPoint(item);

	const upstreamId = firstString(
		item.id,
		item.uid,
		item.icao24,
		item.mmsi,
		item.hex,
		item.callsign,
		item.registration,
	);
	const title = firstString(
		item.title,
		item.label,
		item.name,
		item.description,
		item.headline,
		item.callsign,
		item.icao24,
		item.mmsi,
		item.place,
		item.region_name,
		item.country_name,
	);

	if (!upstreamId && !title) return null;

	const flagged = options.isAnomalous?.(item, layer) ?? false;
	const severity = applySeverityFloor(
		flagged ? "watch" : coerceSeverity(item.severity ?? item.level ?? item.risk ?? item.mag),
		spec.severityFloor,
	);

	const rawTimestamp = firstString(
		item.timestamp,
		item.time,
		item.ts,
		item.last_seen,
		item.published,
		item.begin,
	);
	const parsed = rawTimestamp ? Date.parse(rawTimestamp) : Number.NaN;

	const event: WorldFeedEvent = {
		// Namespacing by layer keeps `aircraft:abc123` distinct from `vessels:abc123`,
		// which share ids in practice and would otherwise dedupe into one row.
		id: `shadowbroker:${layer}:${upstreamId ?? title}`,
		title: title ?? `${spec.label} ${upstreamId}`,
		domain: spec.domain,
		severity,
		source: "shadowbroker",
		timestamp: new Date(Number.isFinite(parsed) ? parsed : now).toISOString(),
	};
	if (geo) {
		event.location = formatGeoLocation(geo);
		event.geo = geo;
	}
	return event;
}

/**
 * A telemetry response → `WorldFeedBrief`.
 *
 * ShadowBroker's `search_telemetry` returns items grouped by layer, but the
 * exact envelope varies by endpoint (`{ layers: {...} }`, `{ results: [...] }`,
 * or a bare array). All three shapes are accepted; unrecognised input yields
 * an empty brief rather than an error, and an empty brief is a no-op for
 * `ingestWorldBrief`.
 */
export function mapTelemetryBrief(
	payload: unknown,
	options: ShadowBrokerMapOptions = {},
): WorldFeedBrief {
	const now = options.now ?? Date.now();
	const events: WorldFeedEvent[] = [];

	const pushItems = (items: unknown, layer: string) => {
		if (!Array.isArray(items)) return;
		for (const item of items) {
			if (!item || typeof item !== "object") continue;
			const mapped = mapTelemetryItem(item as ShadowBrokerTelemetryItem, layer, options);
			if (mapped) events.push(mapped);
		}
	};

	const pushArray = (items: unknown[]) => {
		for (const item of items) {
			if (!item || typeof item !== "object") continue;
			const record = item as Record<string, unknown>;
			const layer = firstString(record.layer, record.type, record.source) ?? "unknown";
			const mapped = mapTelemetryItem(record, layer, options);
			if (mapped) events.push(mapped);
		}
	};

	// GeoJSON FeatureCollection — `/api/live-data` ships `gdelt` and `frontlines`
	// this way. Each feature's own properties name the layer, so one collection
	// can still fan out into the right domains.
	const pushFeatureCollection = (collection: unknown, fallbackLayer: string) => {
		const features = (collection as { features?: unknown } | null)?.features;
		if (!Array.isArray(features)) return;
		for (const feature of features) {
			if (!feature || typeof feature !== "object") continue;
			const props = (feature as { properties?: unknown }).properties;
			if (!props || typeof props !== "object") continue;
			const record = props as Record<string, unknown>;
			const geometry = (feature as { geometry?: { coordinates?: unknown } }).geometry;
			const coords = geometry?.coordinates;
			const withGeo: Record<string, unknown> = { ...record };
			if (Array.isArray(coords) && withGeo.coordinates === undefined) {
				withGeo.coordinates = coords;
			}
			const mapped = mapTelemetryItem(withGeo, fallbackLayer, options);
			if (mapped) events.push(mapped);
		}
	};

	if (Array.isArray(payload)) {
		pushArray(payload);
	} else if (payload && typeof payload === "object") {
		const root = payload as Record<string, unknown>;
		const grouped = root.layers ?? root.results ?? root.data;

		if (Array.isArray(grouped)) {
			pushArray(grouped);
		} else if (grouped && typeof grouped === "object") {
			for (const [layer, items] of Object.entries(grouped as Record<string, unknown>)) {
				pushItems(items, layer);
			}
		} else {
			// Bare `/api/live-data` shape: every top-level key is a layer.
			// Skip scalar metadata (`last_updated`, `sigint_totals`…) — they carry
			// no observations and would otherwise become `general` noise.
			for (const [layer, items] of Object.entries(root)) {
				if (Array.isArray(items)) {
					pushItems(items, layer);
				} else if (items && typeof items === "object" && "features" in items) {
					pushFeatureCollection(items, layer);
				}
			}
		}
	}

	const domains = [...new Set(events.map((event) => event.domain))].sort();

	return {
		source: "shadowbroker",
		summary:
			events.length > 0
				? `ShadowBroker geospatial snapshot — ${events.length} observation(s) across ${domains.length} domain(s).`
				: "ShadowBroker geospatial snapshot — no observations in the requested window.",
		domains,
		events,
		// ShadowBroker observes; it does not forecast. Forecasts come from Pythia,
		// and the correlation engine pairs them with these observations.
		predictions: [],
		fetchedAt: new Date(now).toISOString(),
	};
}
