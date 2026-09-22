// In-Worker travel search proxy and routing engine.
// Flights: LetsFG (letsfg.co). Hotels: TourMind Booking API (api.tourmind.com).

interface TravelFlightSearchRequest {
	origin: string;
	destination: string;
	date?: string;
	adults?: number;
	cabinClass?: string;
}

interface TravelHotelSearchRequest {
	destination: string;
	checkIn: string;
	checkOut: string;
	adults?: number;
	rooms?: number;
	filters?: {
		petsAllowed?: boolean;
		freeCancellation?: boolean;
		starRating?: number;
		/** Per-room nightly budget cap, in `currency` (defaults to CNY). */
		budgetMax?: number;
		/** ISO code for `budgetMax`. TourMind requires CNY whole-stay totals. */
		currency?: string;
		amenities?: string[];
	};
}

function errorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	if (typeof err === "string") return err;
	return "Unknown error";
}

function nightsBetween(checkIn: string, checkOut: string): number {
	const start = Date.parse(checkIn);
	const end = Date.parse(checkOut);
	if (Number.isNaN(start) || Number.isNaN(end)) return 1;
	const days = Math.round((end - start) / 86_400_000);
	return days > 0 ? days : 1;
}

// TourMind's lowest_price / highest_price must be CNY totals covering the whole
// stay across every room. Converts a per-room nightly cap using a live rate.
async function budgetToCnyStayTotal(
	budgetMax: number,
	currency: string,
	nights: number,
	rooms: number,
): Promise<number | null> {
	const code = currency.toUpperCase();
	if (code === "CNY") return Math.round(budgetMax * nights * rooms);
	try {
		const res = await fetch(
			`https://api.frankfurter.app/latest?from=${encodeURIComponent(code)}&to=CNY`,
		);
		if (!res.ok) return null;
		const data = (await res.json()) as { rates?: Record<string, number> };
		const rate = data.rates?.CNY;
		if (typeof rate !== "number" || rate <= 0) return null;
		return Math.round(budgetMax * rate * nights * rooms);
	} catch {
		return null;
	}
}

function jsonOk(data: unknown, corsHeaders: Record<string, string>): Response {
	return new Response(JSON.stringify(data), {
		headers: { ...corsHeaders, "Content-Type": "application/json" },
	});
}

function jsonError(
	status: number,
	payload: { error: string; message?: string },
	corsHeaders: Record<string, string>,
): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { ...corsHeaders, "Content-Type": "application/json" },
	});
}

// TourMind Booking API (https://api.tourmind.com) — ToC channel.
const TOURMIND_BASE = "https://api.tourmind.com";

// Envelope returned by every TourMind endpoint.
interface TourMindEnvelope {
	ok: boolean;
	data?: Record<string, unknown>;
	error_code?: string;
	error?: string;
}

interface TourMindCallOptions {
	path: string;
	body: Record<string, unknown>;
	userKey?: string;
}

// POSTs JSON to the TourMind API and returns its { ok, data, error } envelope.
// Public ToC read endpoints work without credentials; booking/order calls send
// the `uk_` personal key as `user_key`.
async function callTourMind({
	path,
	body,
	userKey,
}: TourMindCallOptions): Promise<TourMindEnvelope> {
	const payload = userKey ? { ...body, user_key: userKey } : body;
	const res = await fetch(`${TOURMIND_BASE}${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"User-Agent": "MuhanAIGateway/1.0 (TravelSearch; +https://travel.kbizhub.com)",
		},
		body: JSON.stringify(payload),
	});

	const text = await res.text();
	let parsed: TourMindEnvelope;
	try {
		parsed = JSON.parse(text) as TourMindEnvelope;
	} catch {
		throw new Error(`TourMind returned non-JSON (HTTP ${res.status})`);
	}

	if (!res.ok && !parsed.error) {
		throw new Error(`TourMind HTTP ${res.status}`);
	}
	return parsed;
}

export async function handleTravelApi(
	request: Request,
	pathname: string,
): Promise<Response | null> {
	const corsHeaders = {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
	};

	if (request.method === "OPTIONS" && pathname.startsWith("/api/travel/")) {
		return new Response(null, { status: 204, headers: corsHeaders });
	}

	// -------------------------------------------------------------
	// 1. FLIGHTS ENGINE — Powered by LetsFG (letsfg.co)
	// -------------------------------------------------------------

	// 1a. POST /api/travel/search — Start or lookup flight search session
	if (pathname === "/api/travel/search" && request.method === "POST") {
		try {
			const body = (await request.json()) as TravelFlightSearchRequest;
			const { origin, destination, date } = body;

			if (!origin || !destination) {
				return jsonError(400, { error: "Missing origin or destination" }, corsHeaders);
			}

			const q = `${origin.toUpperCase()} to ${destination.toUpperCase()}${date ? ` ${date}` : ""}`;
			const upstreamRes = await fetch(`https://letsfg.co/en?q=${encodeURIComponent(q)}`, {
				headers: {
					"User-Agent": "MuhanAIGateway/1.0 (TravelSearch; +https://travel.kbizhub.com)",
					Accept: "text/html,application/xhtml+xml,application/json",
				},
			});

			if (!upstreamRes.ok) {
				return jsonError(
					502,
					{ error: `Upstream LetsFG error: ${upstreamRes.status}` },
					corsHeaders,
				);
			}

			const html = await upstreamRes.text();
			const match = html.match(/ws_[A-Za-z0-9]{6,}/);
			const searchId = match ? match[0] : null;

			return jsonOk(
				{
					engine: "letsfg",
					query: q,
					searchId,
					status: searchId ? "searching" : "pending",
					origin: origin.toUpperCase(),
					destination: destination.toUpperCase(),
					date: date || null,
				},
				corsHeaders,
			);
		} catch (err: unknown) {
			return jsonError(
				500,
				{ error: "Flight search error", message: errorMessage(err) },
				corsHeaders,
			);
		}
	}

	// 1b. GET /api/travel/results/:searchId — Poll flight search results from LetsFG
	if (pathname.startsWith("/api/travel/results/") && request.method === "GET") {
		const searchId = pathname.slice("/api/travel/results/".length).trim();
		if (!searchId) {
			return jsonError(400, { error: "Missing searchId" }, corsHeaders);
		}

		try {
			const upstreamRes = await fetch(
				`https://letsfg.co/api/results/${encodeURIComponent(searchId)}`,
				{
					headers: {
						"User-Agent": "MuhanAIGateway/1.0 (TravelSearch; +https://travel.kbizhub.com)",
						Accept: "application/json",
					},
				},
			);

			if (!upstreamRes.ok) {
				return jsonError(
					upstreamRes.status >= 400 && upstreamRes.status < 500 ? upstreamRes.status : 502,
					{ error: `Upstream error: ${upstreamRes.status}` },
					corsHeaders,
				);
			}

			const data = await upstreamRes.json();
			return jsonOk(data, corsHeaders);
		} catch (err: unknown) {
			return jsonError(
				500,
				{ error: "Flight results poll error", message: errorMessage(err) },
				corsHeaders,
			);
		}
	}

	// -------------------------------------------------------------
	// 2. HOTELS ENGINE — Powered by WinWin.travel MCP Gateway
	// -------------------------------------------------------------

	// 2a. POST /api/travel/hotels/search — Search 3M+ hotels with 500+ filters
	if (pathname === "/api/travel/hotels/search" && request.method === "POST") {
		try {
			const body = (await request.json()) as TravelHotelSearchRequest;
			const { destination, checkIn, checkOut, adults = 2, rooms = 1, filters = {} } = body;

			if (!destination || !checkIn || !checkOut) {
				return jsonError(
					400,
					{ error: "destination, checkIn, and checkOut are required" },
					corsHeaders,
				);
			}

			const userKey = process.env.TOURMIND_USER_KEY || "";

			// 1. Resolve the free-text destination to a TourMind region id.
			const locRes = await callTourMind({
				path: "/skill/toc/search_location",
				body: { keyword: destination },
				userKey,
			});

			if (!locRes.ok) {
				return jsonError(
					502,
					{
						error: "TourMind location lookup failed",
						message: locRes.error || "Could not resolve destination",
					},
					corsHeaders,
				);
			}

			const locData = locRes.data ?? {};
			const regions = Array.isArray(locData.regions)
				? (locData.regions as Array<Record<string, unknown>>)
				: [];
			const region = regions[0];

			if (!region?.region_id) {
				return jsonError(
					404,
					{
						error: "Destination not resolved",
						message: `No TourMind region for "${destination}"`,
					},
					corsHeaders,
				);
			}

			const locationName = String(region.name ?? region.full_name ?? destination);

			// region_id may arrive as a number or string; coerce only scalars so we
			// never forward "[object Object]" to TourMind.
			const rawRegionId = region.region_id;
			if (typeof rawRegionId !== "string" && typeof rawRegionId !== "number") {
				return jsonError(
					502,
					{
						error: "Destination not resolved",
						message: "TourMind returned a region without a usable id",
					},
					corsHeaders,
				);
			}
			const regionId = String(rawRegionId);

			// TourMind only accepts CNY whole-stay price bounds. Convert a per-room
			// nightly budget (defaulting to CNY) before searching.
			const searchBody: Record<string, unknown> = {
				region_id: regionId,
				check_in_date: checkIn,
				check_out_date: checkOut,
				adults,
				room_count: rooms,
				location_name: locationName,
			};

			const budgetMax = filters.budgetMax;
			if (typeof budgetMax === "number" && budgetMax > 0) {
				const cnyTotal = await budgetToCnyStayTotal(
					budgetMax,
					filters.currency || "CNY",
					nightsBetween(checkIn, checkOut),
					rooms,
				);
				if (cnyTotal === null) {
					return jsonError(
						502,
						{
							error: "Budget conversion unavailable",
							message:
								"Could not obtain a live exchange rate to CNY; omit filters.budgetMax or supply a CNY budget.",
						},
						corsHeaders,
					);
				}
				searchBody.highest_price = cnyTotal;
			}

			// 2. Search live-probed hotel candidates in the resolved region.
			const searchRes = await callTourMind({
				path: "/skill/toc/search_hotels",
				body: searchBody,
				userKey,
			});

			if (!searchRes.ok) {
				return jsonError(
					502,
					{
						error: "TourMind hotel search failed",
						message: searchRes.error || "Upstream search error",
					},
					corsHeaders,
				);
			}

			return jsonOk(
				{
					engine: "tourmind",
					provider: "TourMind Booking API",
					source: "tourmind-toc",
					destination,
					locationName,
					regionId,
					checkIn,
					checkOut,
					adults,
					rooms,
					hotels: searchRes.data?.hotels ?? [],
					searchScope: searchRes.data?.search_scope ?? null,
					webUrl: searchRes.data?.web_url ?? null,
				},
				corsHeaders,
			);
		} catch (err: unknown) {
			return jsonError(
				500,
				{ error: "Hotel search error", message: errorMessage(err) },
				corsHeaders,
			);
		}
	}

	// 2b. POST /api/travel/hotels/rates — Live room rates for one hotel.
	// search_hotels.min_price is only a cached signal; this returns bookable products.
	if (pathname === "/api/travel/hotels/rates" && request.method === "POST") {
		try {
			const body = (await request.json()) as {
				hotelId?: string;
				checkIn?: string;
				checkOut?: string;
				adults?: number;
				rooms?: number;
			};
			const { hotelId, checkIn, checkOut, adults = 2, rooms = 1 } = body;

			if (!hotelId || !checkIn || !checkOut) {
				return jsonError(
					400,
					{ error: "hotelId, checkIn, and checkOut are required" },
					corsHeaders,
				);
			}

			const userKey = process.env.TOURMIND_USER_KEY || "";

			const ratesRes = await callTourMind({
				path: "/skill/toc/query_room_rates",
				body: {
					hotel_id: hotelId,
					check_in_date: checkIn,
					check_out_date: checkOut,
					adults,
					room_count: rooms,
				},
				userKey,
			});

			if (!ratesRes.ok) {
				return jsonError(
					502,
					{
						error: "TourMind room-rate query failed",
						message: ratesRes.error || "Upstream rate error",
					},
					corsHeaders,
				);
			}

			const roomTypes = Array.isArray(ratesRes.data?.room_types)
				? (ratesRes.data?.room_types as Array<Record<string, unknown>>)
				: [];

			// An empty live result is a normal 200 response, not a failure.
			return jsonOk(
				{
					engine: "tourmind",
					provider: "TourMind Booking API",
					source: "tourmind-toc",
					hotelId,
					checkIn,
					checkOut,
					adults,
					rooms,
					roomTypes,
					reason: ratesRes.data?.reason ?? null,
					webUrl: ratesRes.data?.web_url ?? null,
				},
				corsHeaders,
			);
		} catch (err: unknown) {
			return jsonError(
				500,
				{ error: "Hotel rate query error", message: errorMessage(err) },
				corsHeaders,
			);
		}
	}

	// 2c. POST /api/travel/hotels/reserve — Verify a selected rate before booking
	if (pathname === "/api/travel/hotels/reserve" && request.method === "POST") {
		try {
			const body = (await request.json()) as {
				hotelId?: string;
				rateCode?: string;
				checkIn?: string;
				checkOut?: string;
				adults?: number;
				rooms?: number;
			};
			const { hotelId, rateCode, checkIn, checkOut, adults = 2, rooms = 1 } = body;

			if (!hotelId || !rateCode || !checkIn || !checkOut) {
				return jsonError(
					400,
					{ error: "hotelId, rateCode, checkIn, and checkOut are required" },
					corsHeaders,
				);
			}

			const userKey = process.env.TOURMIND_USER_KEY || "";

			// Recheck the exact product; the checked values, not the earlier query
			// values, are what create_booking must use.
			const checkRes = await callTourMind({
				path: "/skill/toc/check_room_availability",
				body: {
					hotel_id: hotelId,
					rate_code: rateCode,
					check_in_date: checkIn,
					check_out_date: checkOut,
					adults,
					room_count: rooms,
				},
				userKey,
			});

			if (!checkRes.ok) {
				return jsonError(
					502,
					{
						error: "TourMind rate verification failed",
						message: checkRes.error || "Upstream verification error",
					},
					corsHeaders,
				);
			}

			return jsonOk(
				{
					engine: "tourmind",
					provider: "TourMind Booking API",
					source: "tourmind-toc",
					status: "verified",
					hotelId,
					verified: checkRes.data ?? null,
					note: "Use these checked values for create_booking. No order was created here.",
				},
				corsHeaders,
			);
		} catch (err: unknown) {
			return jsonError(
				500,
				{ error: "Hotel reservation error", message: errorMessage(err) },
				corsHeaders,
			);
		}
	}

	return null;
}
