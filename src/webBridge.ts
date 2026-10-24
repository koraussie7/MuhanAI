import { Capacitor } from "@capacitor/core";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import type {
  Approval,
  ApprovalStatus,
  ChatResult,
  ClientConfig,
  Credentials,
  ProvidersResponse,
  VoiceTokenResult,
  WorldConfig,
} from "./api.js";
import * as api from "./api.js";
import type { MuhanBridge } from "../electron/preload.js";

const CREDS_KEY = "muhan:creds";
const DEFAULT_API_URL = "http://localhost:3001";

const EMPTY: Credentials = { deviceToken: "", adminKey: "" };

declare global {
  interface Window {
    muhan?: MuhanBridge;
  }
}

/** Credential storage: OS keystore/keychain on native, localStorage in plain web.
 *  Mirrors the Electron main-process vault in electron/main.ts. */
async function saveCreds(creds: Credentials): Promise<boolean> {
  const json = JSON.stringify(creds);
  if (Capacitor.isNativePlatform()) {
    await SecureStorage.set(CREDS_KEY, json);
  } else {
    localStorage.setItem(CREDS_KEY, json);
  }
  return true;
}

async function loadCreds(): Promise<Credentials> {
  try {
    const raw = Capacitor.isNativePlatform()
      ? ((await SecureStorage.get(CREDS_KEY)) as string | null)
      : localStorage.getItem(CREDS_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<Credentials>;
    return { deviceToken: parsed.deviceToken ?? "", adminKey: parsed.adminKey ?? "" };
  } catch {
    return { ...EMPTY };
  }
}

async function readApiUrl(): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    return ((await SecureStorage.get("muhan:apiUrl")) as string | null) ?? DEFAULT_API_URL;
  }
  return localStorage.getItem("muhan:apiUrl") ?? DEFAULT_API_URL;
}

async function writeApiUrl(url: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    await SecureStorage.set("muhan:apiUrl", url);
  } else {
    localStorage.setItem("muhan:apiUrl", url);
  }
  return true;
}

/** Web/Capacitor bridge — same shape as the Electron preload bridge. */
export const webBridge: MuhanBridge = {
  getApiUrl: readApiUrl,
  setApiUrl: writeApiUrl,
  setCreds: saveCreds,
  restoreCreds: loadCreds,
  clearCreds: async () => {
    if (Capacitor.isNativePlatform()) {
      await SecureStorage.remove(CREDS_KEY);
    } else {
      localStorage.removeItem(CREDS_KEY);
    }
    return true;
  },
  fetchConfig: (apiUrl: string) => api.fetchConfig(apiUrl),
  redeemPairingCode: (apiUrl, code, meta) => api.redeemPairingCode(apiUrl, code, meta),
  chat: (apiUrl, creds, prompt, system) => api.chat(apiUrl, creds, prompt, system),
  fetchProviders: (apiUrl, deviceToken) => api.fetchProviders(apiUrl, deviceToken),
  pendingApprovals: (apiUrl, creds) => api.pendingApprovals(apiUrl, creds),
  decideApproval: (apiUrl, creds, id, decision, reason) =>
    api.decideApproval(apiUrl, creds, id, decision, reason),
  requestApproval: (apiUrl, deviceToken, req) => api.requestApproval(apiUrl, deviceToken, req),

  // World View (GEV integration)
  fetchWorldConfig: (apiUrl: string) => api.fetchWorldConfig(apiUrl),
  worldProxy: (apiUrl: string, token: string, path: string, init?: RequestInit) =>
    api.worldProxy(apiUrl, token, path, init),
  fetchVoiceToken: (apiUrl: string, deviceToken: string) =>
    api.fetchVoiceToken(apiUrl, deviceToken),
  installUpdate: async () => {
    const bridge = window.muhan;
    if (bridge?.installUpdate) return bridge.installUpdate();
    return false;
  },
};

/** Shared access for App: Electron preload bridge when present, web bridge otherwise. */
export function getBridge(): MuhanBridge {
  return window.muhan ?? webBridge;
}

export type {
  Approval,
  ApprovalStatus,
  ChatResult,
  ClientConfig,
  Credentials,
  ProvidersResponse,
  VoiceTokenResult,
  WorldConfig,
};
