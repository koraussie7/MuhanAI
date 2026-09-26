import type { DnsLinkAdapter, DnsLinkRecord } from "./dnslink.js";

/**
 * Cloudflare DNSLink adapter for production use.
 * Manages DNS TXT records via the Cloudflare API.
 *
 * Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID environment variables.
 */
export class CloudflareDnsLinkAdapter implements DnsLinkAdapter {
	private readonly apiToken: string;
	private readonly zoneId: string;
	private readonly baseUrl: string;

	constructor() {
		const token = process.env.CLOUDFLARE_API_TOKEN;
		const zone = process.env.CLOUDFLARE_ZONE_ID;
		if (!token || !zone) {
			throw new Error(
				"CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID are required for CloudflareDnsLinkAdapter",
			);
		}
		this.apiToken = token;
		this.zoneId = zone;
		this.baseUrl = "https://api.cloudflare.com/client/v4";
	}

	private async cloudflareFetch(path: string, init?: RequestInit): Promise<unknown> {
		const res = await fetch(`${this.baseUrl}${path}`, {
			...init,
			headers: {
				Authorization: `Bearer ${this.apiToken}`,
				"Content-Type": "application/json",
				...init?.headers,
			},
		});
		if (!res.ok) {
			const text = await res.text();
			throw new Error(`Cloudflare API error: ${res.status} ${text}`);
		}
		return res.json();
	}

	private async findTxtRecordId(subdomain: string): Promise<string | null> {
		const target = `_dnslink.${subdomain}.kbizhub.com`;
		const result = await this.cloudflareFetch(
			`/zones/${this.zoneId}/dns_records?type=TXT&name=${encodeURIComponent(target)}`,
		);
		const records = (result as { result?: Array<{ id: string }> }).result ?? [];
		return records[0]?.id ?? null;
	}

	async updateDnsLink(subdomain: string, cid: string): Promise<DnsLinkRecord> {
		const txtValue = `/ipfs/${cid}`;
		const target = `_dnslink.${subdomain}.kbizhub.com`;

		const existingId = await this.findTxtRecordId(subdomain);

		if (existingId) {
			await this.cloudflareFetch(`/zones/${this.zoneId}/dns_records/${existingId}`, {
				method: "PUT",
				body: JSON.stringify({
					type: "TXT",
					name: target,
					content: txtValue,
					ttl: 60,
					proxied: false,
				}),
			});
		} else {
			await this.cloudflareFetch(`/zones/${this.zoneId}/dns_records`, {
				method: "POST",
				body: JSON.stringify({
					type: "TXT",
					name: target,
					content: txtValue,
					ttl: 60,
					proxied: false,
				}),
			});
		}

		return {
			subdomain,
			domain: "kbizhub.com",
			cid,
			txtValue,
			updatedAt: Date.now(),
		};
	}

	async rollbackDnsLink(subdomain: string, oldCid: string): Promise<DnsLinkRecord> {
		return this.updateDnsLink(subdomain, oldCid);
	}

	async getDnsLink(subdomain: string): Promise<DnsLinkRecord | null> {
		const target = `_dnslink.${subdomain}.kbizhub.com`;
		const result = await this.cloudflareFetch(
			`/zones/${this.zoneId}/dns_records?type=TXT&name=${encodeURIComponent(target)}`,
		);
		const records = (result as { result?: Array<{ content: string }> }).result ?? [];
		const content = records[0]?.content;
		if (!content || !content.startsWith("/ipfs/")) return null;
		const cid = content.slice(6);
		return {
			subdomain,
			domain: "kbizhub.com",
			cid,
			txtValue: content,
			updatedAt: Date.now(),
		};
	}

	async listDnsLinks(): Promise<DnsLinkRecord[]> {
		const result = await this.cloudflareFetch(`/zones/${this.zoneId}/dns_records?type=TXT`);
		const records = (result as { result?: Array<{ name: string; content: string }> }).result ?? [];
		return records
			.filter((r) => r.name.startsWith("_dnslink.") && r.content.startsWith("/ipfs/"))
			.map((r) => {
				const subdomain = r.name.replace(/^_dnslink\./, "").replace(/\.kbizhub\.com$/, "");
				const cid = r.content.slice(6);
				return {
					subdomain,
					domain: "kbizhub.com",
					cid,
					txtValue: r.content,
					updatedAt: Date.now(),
				};
			});
	}
}
