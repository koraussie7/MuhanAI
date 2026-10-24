/** Platform-neutral API layer — no electron, no DOM globals beyond fetch.
 * Shared by the Electron preload bridge and the web/Capacitor bridge.
 *
 * Contract source of truth: services/api/src/thin-client-routes.ts (Phase 0).
 * That server exposes TWO non-interchangeable credentials:
 *   - device token (`tc_…`, minted by POST /pair/redeem) → providers, BYOK keys
 *   - admin key  (`x-api-key`, == process.env.API_KEY)   → chat, approvals
 * PLAN Phase 2 assumed a single token would do both. The server does not, so
 * callers carry both and let the server decide. See docs §6 for the open
 * question of how a thin client is meant to obtain the admin capability.
 */

export interface Credentials {
  deviceToken: string;
  adminKey: string;
}

export interface ChatResult {
  text: string;
  provider: string;
  model?: string;
  tier?: string;
  latencyMs?: number;
}

export interface ProviderInfo {
  provider: string;
  hasServerKey: boolean;
  envVars: string[];
  hasByokKey: boolean;
  byokMasked: string | null;
  ready: boolean;
}

export interface ProvidersResponse {
  keyless: string[];
  omniroute: string[];
  byok: ProviderInfo[];
}

export type RiskTier = "read" | "write" | "external" | "system";
export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";

/** Mirrors the server's ApprovalTicket. Timestamps are epoch milliseconds. */
export interface Approval {
  id: string;
  resource: string;
  riskTier: RiskTier;
  summary: string;
  args?: Record<string, string | number | boolean | null>;
  deviceId?: string;
  traceId?: string;
  status: ApprovalStatus;
  createdAt: number;
  expiresAt: number;
  decidedAt?: number;
  reason?: string;
  decidedBy?: string;
}

export interface PairRedeemResult {
  token: string;
  deviceId: string;
  /** Seconds until the server-side record expires (server hard-codes 30d). */
  expiresIn: number;
}

export interface ClientConfig {
  latestVersion: string;
  minimumVersion: string;
  updateChannel: string;
  releaseNotes: string;
  downloadBaseUrl: string;
  keylessProviders: string[];
  byokProviders: string[];
}

/** Public endpoints need no credentials at all. */
async function anon<T>(apiUrl: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  return (await res.json()) as T;
}

/** Device-scoped endpoints: `x-device-token: tc_…` (minted by pair/redeem). */
async function asDevice<T>(apiUrl: string, token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", "x-device-token": token, ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  return (await res.json()) as T;
}

/** Admin-scoped endpoints: `x-api-key: <process.env.API_KEY>`.
 *  /api/llm/chat and /api/thin-client/approvals* are NOT under the public
 *  path prefixes in server.ts, so the global onRequest hook rejects a device
 *  token before the route handler ever runs. */
async function asAdmin<T>(apiUrl: string, key: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", "x-api-key": key, ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  return (await res.json()) as T;
}

/** GET /api/thin-client/config — public. */
export function fetchConfig(apiUrl: string): Promise<ClientConfig> {
  return anon<ClientConfig>(apiUrl, "/api/thin-client/config");
}

/** POST /api/llm/chat — admin key required. */
export function chat(apiUrl: string, creds: Credentials, prompt: string, system?: string): Promise<ChatResult> {
  return asAdmin<ChatResult>(apiUrl, creds.adminKey, "/api/llm/chat", {
    method: "POST",
    body: JSON.stringify({ prompt, system }),
  });
}

/** GET /api/thin-client/providers — device token required. */
export function fetchProviders(apiUrl: string, token: string): Promise<ProvidersResponse> {
  return asDevice<ProvidersResponse>(apiUrl, token, "/api/thin-client/providers");
}

/** POST /api/thin-client/pair — public; asks the SERVER to mint a code.
 *  This is the "confirm on the web console" direction, not what a client uses. */
export function startPairing(
  apiUrl: string,
  label: string,
  platform: "darwin" | "win32" | "linux",
): Promise<{ code: string; expiresIn: number }> {
  return anon<{ code: string; expiresIn: number }>(apiUrl, "/api/thin-client/pair", {
    method: "POST",
    body: JSON.stringify({ label, platform }),
  });
}

/** POST /api/thin-client/pair/redeem — public; exchanges a user-entered 6-char
 *  code for a device token. Single use; the code dies on first success. */
export function redeemPairingCode(
  apiUrl: string,
  code: string,
  meta: { label?: string; platform?: "darwin" | "win32" | "linux"; appVersion?: string } = {},
): Promise<PairRedeemResult> {
  return anon<PairRedeemResult>(apiUrl, "/api/thin-client/pair/redeem", {
    method: "POST",
    body: JSON.stringify({ code, ...meta }),
  });
}

/** GET /api/thin-client/approvals — admin key required (server enforces). */
export function pendingApprovals(apiUrl: string, creds: Credentials): Promise<Approval[]> {
  return asAdmin<{ approvals: Approval[] }>(
    apiUrl,
    creds.adminKey,
    "/api/thin-client/approvals",
  ).then((r) => r.approvals);
}

/** POST /api/thin-client/approvals/:id/decision — admin key required. */
export function decideApproval(
  apiUrl: string,
  creds: Credentials,
  id: string,
  decision: "approve" | "deny",
  reason?: string,
): Promise<{ ok: boolean; id: string; status: ApprovalStatus }> {
  return asAdmin<{ ok: boolean; id: string; status: ApprovalStatus }>(
    apiUrl,
    creds.adminKey,
    `/api/thin-client/approvals/${id}/decision`,
    { method: "POST", body: JSON.stringify({ decision, reason }) },
  );
}

/** POST /api/thin-client/approvals — device token required; opens a ticket. */
export function requestApproval(
  apiUrl: string,
  token: string,
  req: {
    resource: "computer-use" | "quorum" | "shell" | "filesystem" | "network" | "other";
    riskTier: RiskTier;
    summary: string;
    args?: Record<string, string | number | boolean | null>;
    traceId?: string;
  },
): Promise<{ id: string; status: ApprovalStatus; expiresAt: number }> {
  return asDevice(apiUrl, token, "/api/thin-client/approvals", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

/** GEV 월드 뷰 설정 — 공개 엔드포인트 (인증 불필요) */
export interface WorldConfig {
  gevUrl: string;
  features: {
    cctv: boolean;
    flights: boolean;
    ships: boolean;
    satellites: boolean;
    voice: boolean;
  };
  minClientVersion: string;
  updateUrl: string;
}

/** GET /api/world/config — public */
export function fetchWorldConfig(apiUrl: string): Promise<WorldConfig> {
  return anon<WorldConfig>(apiUrl, "/api/world/config");
}

/** POST /api/world/proxy/:path — deviceToken 필요, GEV API 프래밍 */
export function worldProxy(
  apiUrl: string,
  token: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${apiUrl}/api/world/proxy/${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-device-token": token,
      ...(init?.headers ?? {}),
    },
  });
}

/** POST /api/world/voice/token — OpenAI Realtime 세션 토큰 (서버에서 키 브로커링) */
export interface VoiceTokenResult {
  token: string;
  expiresAt: number;
  model: string;
}

export function fetchVoiceToken(
  apiUrl: string,
  token: string
): Promise<VoiceTokenResult> {
  return asDevice<VoiceTokenResult>(apiUrl, token, "/api/world/voice/token", {
    method: "POST",
  });
}
