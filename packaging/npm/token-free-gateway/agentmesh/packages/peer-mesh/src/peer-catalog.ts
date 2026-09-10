/**
 * Peer catalog — tracks every discovered peer with metadata.
 *
 * Pattern source: folklore/infrastructure/peer-store.ts + peer-transport.ts
 * (discovery_method tagging + peer:connect / peer:disconnect event hook).
 *
 * DiscoveryMethod enum lets services/api present peer provenance in
 * /api/network responses (folklore's per-peer discovery_method label).
 */

export enum DiscoveryMethod {
	Bootstrap = "bootstrap",
	Mdns = "mdns",
	Dht = "dht",
	Manual = "manual",
	Rendezvous = "rendezvous",
}

export type ReputationTier = "free" | "contributor" | "power" | "unlimited";

export interface PeerCatalogEntry {
	id: string;
	addrs: string[];
	addedAt: number;
	lastSeen: number;
	discoveryMethod: DiscoveryMethod;
	reputation?: number;
	reputationTier?: ReputationTier;
	tags: Record<string, { value: number }>;
}

export class PeerCatalog {
	private entries = new Map<string, PeerCatalogEntry>();

	upsert(entry: PeerCatalogEntry): PeerCatalogEntry {
		const prev = this.entries.get(entry.id);
		const merged: PeerCatalogEntry = {
			...prev,
			...entry,
			tags: { ...(prev?.tags ?? {}), ...entry.tags },
		};
		this.entries.set(entry.id, merged);
		return merged;
	}

	get(id: string): PeerCatalogEntry | undefined {
		return this.entries.get(id);
	}

	list(): PeerCatalogEntry[] {
		return Array.from(this.entries.values());
	}

	online(): PeerCatalogEntry[] {
		const cutoff = Date.now() - 5 * 60_000;
		return this.list().filter((e) => e.lastSeen > cutoff);
	}

	remove(id: string): boolean {
		return this.entries.delete(id);
	}

	size(): number {
		return this.entries.size;
	}
}
