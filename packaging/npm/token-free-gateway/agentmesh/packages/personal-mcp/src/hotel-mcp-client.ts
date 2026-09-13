/**
 * Hotel MCP Client for MuhanAI Personal MCP integration.
 *
 * Wraps Google Hotels API (or compatible) over HTTP transport:
 *   - hotel_search: Search hotels by location, dates, guests
 *   - hotel_details: Get detailed hotel information
 *
 * Falls back gracefully when Hotel API is not configured.
 */

export interface HotelMcpClientOptions {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface HotelSearchParams {
  location: string;
  checkIn: string;
  checkOut: string;
  adults?: number;
  children?: number;
  currency?: string;
  sortBy?: "price" | "rating" | "distance";
}

export interface Hotel {
  id: string;
  name: string;
  address: string;
  rating: number;
  reviewCount: number;
  pricePerNight: number;
  currency: string;
  images: string[];
  amenities: string[];
  location: {
    lat: number;
    lng: number;
  };
}

export interface HotelSearchResponse {
  hotels: Hotel[];
  totalCount: number;
  searchId: string;
}

export class HotelMcpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: HotelMcpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey ?? "";
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  private async call<T>(endpoint: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.fetchImpl(url.toString(), {
        method: "GET",
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<T>;
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  }

  async searchHotels(params: HotelSearchParams): Promise<HotelSearchResponse> {
    const searchParams: Record<string, string> = {
      location: params.location,
      check_in: params.checkIn,
      check_out: params.checkOut,
      adults: String(params.adults ?? 2),
      children: String(params.children ?? 0),
      currency: params.currency ?? "KRW",
    };
    if (params.sortBy) searchParams.sort_by = params.sortBy;

    return this.call<HotelSearchResponse>("/api/v1/hotels/search", searchParams);
  }

  async getHotelDetails(hotelId: string): Promise<Hotel> {
    return this.call<Hotel>(`/api/v1/hotels/${hotelId}`, {});
  }
}

let hotelMcpClient: HotelMcpClient | null = null;

export function getHotelMcpClient(): HotelMcpClient {
  if (!hotelMcpClient) {
    const baseUrl = process.env.HOTEL_API_BASE_URL ?? "https://api.google-hotels.example.com";
    const apiKey = process.env.HOTEL_API_KEY;
    hotelMcpClient = new HotelMcpClient({ baseUrl, apiKey });
  }
  return hotelMcpClient;
}

export class HotelMcpUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HotelMcpUnavailableError";
  }
}

export function isHotelMcpAvailable(): boolean {
  return !!process.env.HOTEL_API_BASE_URL;
}