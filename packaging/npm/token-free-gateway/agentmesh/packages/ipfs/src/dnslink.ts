import type { PinResult, PinStatus } from "./types.js";

/**
 * Cloudflare DNSLink adapter for the One-Click Factory System.
 * Manages DNSLink TXT records via the Cloudflare API.
 *
 * In production, uses a real Cloudflare API token.
 * In development/offline mode, uses MockDnsLinkAdapter for simulation.
 */
export interface DnsLinkRecord {
	subdomain: string;
	domain: string;
	cid: string;
	txtValue: string;
	updatedAt: number;
}

export interface DnsLinkAdapter {
	/** Update DNSLink TXT record to point at a new CID */
	updateDnsLink(subdomain: string, cid: string): Promise<DnsLinkRecord>;
	/** Rollback to a previous CID */
	rollbackDnsLink(subdomain: string, oldCid: string): Promise<DnsLinkRecord>;
	/** Get current DNSLink record */
	getDnsLink(subdomain: string): Promise<DnsLinkRecord | null>;
	/** List all managed DNSLink records */
	listDnsLinks(): Promise<DnsLinkRecord[]>;
}

/** Simulated DNSLink adapter for offline/dev mode */
export class MockDnsLinkAdapter implements DnsLinkAdapter {
	private readonly records = new Map<string, DnsLinkRecord>();

	async updateDnsLink(subdomain: string, cid: string): Promise<DnsLinkRecord> {
		const record: DnsLinkRecord = {
			subdomain,
			domain: `kbizhub.com`,
			cid,
			txtValue: `/ipfs/${cid}`,
			updatedAt: Date.now(),
		};
		this.records.set(subdomain, record);
		return record;
	}

	async rollbackDnsLink(subdomain: string, oldCid: string): Promise<DnsLinkRecord> {
		const record: DnsLinkRecord = {
			subdomain,
			domain: `kbizhub.com`,
			cid: oldCid,
			txtValue: `/ipfs/${oldCid}`,
			updatedAt: Date.now(),
		};
		this.records.set(subdomain, record);
		return record;
	}

	async getDnsLink(subdomain: string): Promise<DnsLinkRecord | null> {
		return this.records.get(subdomain) ?? null;
	}

	async listDnsLinks(): Promise<DnsLinkRecord[]> {
		return [...this.records.values()];
	}
}
