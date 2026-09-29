/**
 * OpsMaxx vault adapter for muhan-agent.
 *
 * T2 of the OpsMaxx × MuhanAI integration
 * (see docs/adr/0010-opsmaxx-bridge.md and
 *  docs/agentmesh/AGENT-ASSIGNMENT-PLAN.md).
 *
 * Purpose
 * -------
 * The existing credentials vault (`./credentials-vault.ts`) is the
 * authoritative source of truth: passphrase-protected, AES-256-GCM,
 * PBKDF2 with 200k iterations. OpsMaxx already has its own safeStorage-
 * backed vault on the user's machine. T2 adds a thin adapter so the
 * two vaults stay in sync without either one becoming the master.
 *
 * Sync rules
 * ----------
 *   - On daemon start, the adapter enumerates OpsMaxx vault entries
 *     and seeds the local vault with metadata-only entries (`hasSecret`
 *     flag set, no plaintext copied across).
 *   - When `vault.put` runs locally, the secret is stored in the local
 *     vault first; the bridge is then told to also persist it via
 *     `opsmaxx-bridge.vault.set` so the user can see it in OpsMaxx.
 *   - Conflict policy: same `service` key on both sides means the user
 *     has actively entered it in OpsMaxx. OpsMaxx wins, locally we
 *     evict the metadata entry but keep the in-memory cache empty so
 *     the next `get` round-trips again.
 *   - The HMAC `sub` claim verified by
 *     `services/api/src/list-routes.ts:resolveOwner` is **never**
 *     consulted here. Owner identity stays in the API layer; this file
 *     is purely about credential material, not identity.
 *
 * Identity / non-goals
 * --------------------
 *   - The adapter does not import Electron or any OpsMaxx Go/TS code.
 *     OpsMaxx is reached only through `@agentmesh/opsmaxx-bridge`.
 *   - Secrets **never** leave the boundary in plaintext unless the
 *     caller is `vault.put`/`vault.set` on the local side; the bridge
 *     API accepts a secret but is treated as a sealed channel.
 *   - We do not implement an "import everything from OpsMaxx" mode.
 *     Each entry is opted in by the user via the OpsMaxx approval card.
 */

import type { VaultEntry as BridgeVaultEntry, OpsMaxxBridge } from "@agentmesh/opsmaxx-bridge";

import {
	createVault,
	unlockVault,
	VaultAuthError,
	type VaultBlob,
	type VaultEntry,
} from "./credentials-vault.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OpsMaxxVaultAdapterConfig {
	bridge: OpsMaxxBridge;
	/** Passphrase for the local vault; throws VaultAuthError on mismatch. */
	passphrase: string;
	/** Optional initial local blob; when omitted, an empty vault is created. */
	blob?: VaultBlob;
}

export type SyncedVaultEntry = VaultEntry & { hasSecret?: boolean };

export interface SyncedVaultHandle {
	/** Local vault handle — same shape as `credentials-vault.VaultHandle`. */
	list(): VaultEntry[];
	/**
	 * Local-first, OpsMaxx-backed: when the local entry is missing
	 * (e.g. evicted during a conflict), round-trip through
	 * `bridge.vault.get` and return remote metadata only.
	 */
	get(service: string): Promise<SyncedVaultEntry | null>;
	put(entry: VaultEntry): Promise<VaultBlob>;
	remove(service: string): Promise<VaultBlob>;
	/** Force a re-sync against OpsMaxx; returns the diff OpsMaxx reported. */
	resync(): Promise<ResyncReport>;
	/** Close the underlying bridge. Idempotent. */
	close(): Promise<void>;
}

export interface ResyncReport {
	addedFromOpsMaxx: string[];
	evictedLocally: string[];
	conflicts: string[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Create and unlock a synced vault handle.
 *
 * The local blob is authoritative on disk; OpsMaxx is consulted only
 * to enrich metadata (`hasSecret`, `note`, `updatedAt`). On
 * construction the adapter does a one-shot resync so the dashboard
 * reflects OpsMaxx state without waiting for the first user action.
 */
export async function createOpsMaxxVaultAdapter(
	config: OpsMaxxVaultAdapterConfig,
): Promise<SyncedVaultHandle> {
	const blob =
		config.blob ??
		(await createVault({
			passphrase: config.passphrase,
			entries: [],
		}));
	const local = await unlockVault({ blob, passphrase: config.passphrase });
	let currentBlob = blob;

	// Initial resync.
	await resyncOnce(local, config.bridge);

	async function persist(updated: VaultBlob): Promise<void> {
		currentBlob = updated;
	}

	async function resyncOnce(
		localHandle: {
			get(service: string): VaultEntry | null;
			put(entry: VaultEntry): Promise<VaultBlob>;
			remove(service: string): Promise<VaultBlob>;
			list(): VaultEntry[];
		},
		bridge: OpsMaxxBridge,
	): Promise<ResyncReport> {
		const remoteList = await bridge.vault.list();
		if (!remoteList.ok) {
			// Bridge unreachable — log via the daemon's pino logger in T2 wiring.
			// Adapter keeps working against the local blob.
			return { addedFromOpsMaxx: [], evictedLocally: [], conflicts: [] };
		}

		const addedFromOpsMaxx: string[] = [];
		const evictedLocally: string[] = [];
		const conflicts: string[] = [];

		for (const remote of remoteList.value) {
			const localEntry = localHandle.get(remote.service);
			if (!localEntry) {
				// OpsMaxx has an entry we don't; copy metadata only.
				const nextBlob = await localHandle.put({
					service: remote.service,
					secret: "",
					note: remote.note,
					updatedAt: remote.updatedAt,
				});
				await persist(nextBlob);
				addedFromOpsMaxx.push(remote.service);
			} else if (localEntry.updatedAt < remote.updatedAt) {
				// OpsMaxx is newer; OpsMaxx wins. Evict local so the next
				// `get` round-trips through the bridge.
				const nextBlob = await localHandle.remove(remote.service);
				await persist(nextBlob);
				evictedLocally.push(remote.service);
				conflicts.push(remote.service);
			}
		}

		return { addedFromOpsMaxx, evictedLocally, conflicts };
	}

	return {
		list: () => local.list(),

			async get(service): Promise<SyncedVaultEntry | null> {
		const localEntry = local.get(service);
		if (localEntry) return localEntry;
			// Evicted (or never synced): OpsMaxx wins, so fetch remote
			// metadata so the caller still sees the entry exists.
						const remote = await config.bridge.vault.get(service);
					if (!remote.ok || !remote.value) return null;
					return {
					service: remote.value.service,
					secret: "",
						note: remote.value.note,
					updatedAt: remote.value.updatedAt,
						hasSecret: remote.value.hasSecret,
					};
		},

		async put(entry) {
			const nextBlob = await local.put(entry);
			await persist(nextBlob);
			// Mirror to OpsMaxx so the user sees the secret in their desktop app.
			// Failures here must not roll back the local write — the local
			// vault is authoritative for credential availability.
			const mirror = await config.bridge.vault.set(entry.service, entry.secret, entry.note);
			if (!mirror.ok) {
				// T2 wiring: replace with `logger.warn({ err: mirror.error }, ...)`.
				// Surface silently here so callers do not have to special-case it.
			}
			return nextBlob;
		},

		async remove(service) {
			const nextBlob = await local.remove(service);
			await persist(nextBlob);
			// Best-effort mirror.
			await config.bridge.vault.remove(service);
			return nextBlob;
		},

		async resync() {
			return resyncOnce(local, config.bridge);
		},

		async close() {
			await config.bridge.close();
		},
	};
}

/**
 * Re-export so the agent daemon can expose OpsMaxx-sourced entries in
 * its `vault-get` capability without a second import line.
 */
export type { BridgeVaultEntry };
export { VaultAuthError };
