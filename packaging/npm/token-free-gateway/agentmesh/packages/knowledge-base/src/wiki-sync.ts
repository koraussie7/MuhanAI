/**
 * WeKnora Wiki ↔ MuhanAI KnowledgeNode synchronization.
 *
 * Bridges WeKnora's Wiki Mode (auto-generated interlinked markdown pages)
 * with MuhanAI's KnowledgeNode graph.
 *
 * Sync rules:
 *   - WeKnora Wiki page created → MuhanAI KnowledgeNode auto-created
 *   - KnowledgeNode updated → WeKnora Wiki revision created
 *   - WikiLinks [[...]] → Cosmic Canvas node links
 */

import type { KnowledgeNode } from "../../shared/types";
import { WeKnoraClient } from "./weknora-client";

export interface WeKnoraWikiPage {
	pageId: string;
	title: string;
	content: string;
	revisionId?: string;
	updatedAt?: string;
	links?: string[];
}

export interface WikiSyncOptions {
	ownerId: string;
	kbId?: string;
	direction?: "import" | "export" | "bidirectional";
}

export class WikiSync {
	private readonly weknora: WeKnoraClient | null;
	private readonly kbId: string;

	constructor(opts: { baseUrl?: string; apiKey?: string; kbId?: string; fetchImpl?: typeof fetch }) {
		this.kbId = opts.kbId ?? "default";
		this.weknora = opts.baseUrl
			? new WeKnoraClient({ baseUrl: opts.baseUrl, apiKey: opts.apiKey, fetchImpl: opts.fetchImpl })
			: null;
	}

	/**
	 * Import all Wiki pages from WeKnora into MuhanAI KnowledgeNode storage.
	 */
	async importWikiPages(ownerId: string): Promise<KnowledgeNode[]> {
		if (!this.weknora) return [];

		const pages = await this.fetchWikiPages();
		const nodes: KnowledgeNode[] = [];

		for (const page of pages) {
			const node = await this.wikiPageToKnowledgeNode(ownerId, page);
			nodes.push(node);

			const { indexKnowledgeNode } = await import("./index-pipeline");
			await indexKnowledgeNode(node);
		}

		return nodes;
	}

	/**
	 * Export a MuhanAI KnowledgeNode as a WeKnora Wiki page.
	 */
	async exportKnowledgeNodeToWiki(node: KnowledgeNode): Promise<void> {
		if (!this.weknora) return;

		const page: WeKnoraWikiPage = {
			pageId: node.id,
			title: node.title,
			content: node.content,
			updatedAt: node.updatedAt.toISOString(),
			links: this.extractWikiLinks(node.content),
		};

		await this.weknora.createWikiPage(this.kbId, page);
	}

	/**
	 * Sync revisions for a specific KnowledgeNode.
	 */
	async syncRevisions(nodeId: string): Promise<WeKnoraWikiPage[]> {
		if (!this.weknora) return [];
		return this.weknora.getWikiRevisions(this.kbId, nodeId);
	}

	private async fetchWikiPages(): Promise<WeKnoraWikiPage[]> {
		if (!this.weknora) return [];
		return this.weknora.listWikiPages(this.kbId);
	}

	private async wikiPageToKnowledgeNode(
		ownerId: string,
		page: WeKnoraWikiPage,
	): Promise<KnowledgeNode> {
		return {
			id: page.pageId,
			ownerId,
			categoryId: "wiki",
			title: page.title,
			content: page.content,
			sourceType: "document",
			visibility: "shared",
			permissions: {
				readableBy: [ownerId],
				usableByAgents: true,
				commercialUse: false,
			},
			confidence: 0.9,
			createdAt: new Date(),
			updatedAt: page.updatedAt ? new Date(page.updatedAt) : new Date(),
			metadata: {
				source: "weknora_wiki",
				revisionId: page.revisionId,
				links: page.links,
			},
		};
	}

	private extractWikiLinks(content: string): string[] {
		const matches = content.matchAll(/\[\[([^\]]+)\]\]/g);
		return Array.from(matches, (m) => m[1]).filter((link): link is string => Boolean(link));
	}
}

export const wikiSync = new WikiSync({
	baseUrl: globalThis.process?.env?.WEKNORA_HOST,
	apiKey: globalThis.process?.env?.WEKNORA_API_KEY,
	kbId: globalThis.process?.env?.WEKNORA_KB_ID,
});
