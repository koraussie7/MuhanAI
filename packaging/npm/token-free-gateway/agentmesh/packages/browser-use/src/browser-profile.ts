/**
 * Browser Profile Manager
 * 
 * AIHawk-compatible browser profile settings.
 * Manages browser identity, fingerprint, and proxy bindings.
 * 
 * Profile pins seed + identity, NOT the proxy.
 * Timezone/locale/geography follow the proxy exit.
 */

export interface BrowserProfile {
  /** Opaque identifier; same value as the SEED used to derive the fingerprint. */
  seed: number;
  /** Human label; surfaced in join flows. */
  label: string;
  /** SHA-ish fingerprint hash; first 12 chars only, never the raw seed. */
  fingerprintPreview: string;
  /** Currently-bound proxy exit; null = direct. */
  proxy: string | null;
  /** ms since epoch. */
  lastUsed: number;
  /** ms since epoch; undefined = never. */
  revokedAt?: number;
}

export interface BrowserProfileSettings {
  listProfiles(): Promise<BrowserProfile[]>;
  rotateSeed(seed: number): Promise<BrowserProfile>;
  rebindProxy(seed: number, proxy: string | null): Promise<void>;
  revokeProfile(seed: number): Promise<void>;
}

/**
 * Create a browser profile manager with in-memory storage.
 * Production uses SQLite-backed storage.
 */
export function createBrowserProfileManager(): BrowserProfileSettings {
  const profiles: BrowserProfile[] = [];
  let nextSeed = 1000;

  function generateFingerprint(seed: number): string {
    // Simple hash for demo; production uses proper fingerprinting
    let hash = 0;
    const str = seed.toString();
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(12, '0').slice(0, 12);
  }

  return {
    async listProfiles() {
      return [...profiles].sort((a, b) => b.lastUsed - a.lastUsed);
    },

    async rotateSeed(seed: number) {
      const next = nextSeed++;
      const profile: BrowserProfile = {
        seed: next,
        label: `Rotated from ${seed}`,
        fingerprintPreview: generateFingerprint(next),
        proxy: null,
        lastUsed: Date.now(),
      };
      profiles.push(profile);
      return profile;
    },

    async rebindProxy(seed: number, proxy: string | null) {
      const profile = profiles.find((p) => p.seed === seed);
      if (profile) {
        profile.proxy = proxy;
        profile.lastUsed = Date.now();
      }
    },

    async revokeProfile(seed: number) {
      const profile = profiles.find((p) => p.seed === seed);
      if (profile) {
        profile.revokedAt = Date.now();
      }
    },
  };
}
