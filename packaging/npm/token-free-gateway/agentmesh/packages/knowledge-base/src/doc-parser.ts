/**
 * Document parsing orchestration for MuhanAI knowledge-base.
 *
 * Bridges MuhanAI KnowledgeNode storage with WeKnora's document parsing pipeline.
 * Falls back to in-memory chunking when WeKnora is unavailable.
 */

import type { KnowledgeNode, SourceType } from "@agentmesh/shared-types";
import { WeKnoraClient } from "./weknora-client";
import { chunkText } from "./chunking";

export interface DocumentParseResult {
	documentId: string;
	title: string;
	chunksCount: number;
	status: "pending" | "parsing" | "completed" | "failed";
	error?: string;
}

export interface DocumentUploadOptions {
	processConfig?: Record<string, unknown>;
	parser?: string;
	chunkSize?: number;
	chunkOverlap?: number;
}

export class DocumentParser {
	private readonly weknora: WeKnoraClient | null;
	private readonly kbId: string;

	constructor(opts: { baseUrl?: string; apiKey?: string; kbId?: string }) {
		this.kbId = opts.kbId ?? "default";
		if (opts.baseUrl) {
			this.weknora = new WeKnoraClient({
				baseUrl: opts.baseUrl,
				apiKey: opts.apiKey,
			});
		} else {
			this.weknora = null;
		}
	}

	/**
	 * Upload a file to WeKnora for parsing, or fall back to local chunking.
	 */
	async uploadAndParse(
		ownerId: string,
		file: File,
		options: DocumentUploadOptions = {},
	): Promise<DocumentParseResult> {
		if (!this.weknora) {
			return this.fallbackLocalParse(ownerId, file, options);
		}

		const processConfig = options.processConfig ?? {
			parser: options.parser ?? "auto",
			chunk_size: options.chunkSize ?? 800,
			chunk_overlap: options.chunkOverlap ?? 120,
		};

		const doc = await this.weknora.uploadDocument(this.kbId, file, processConfig);
		return {
			documentId: doc.documentId,
			title: doc.title,
			chunksCount: 0,
			status: "pending",
		};
	}

	/**
	 * Poll WeKnora parse status until completion.
	 */
	async waitForParse(documentId: string, timeoutMs = 120_000): Promise<DocumentParseResult> {
		if (!this.weknora) {
			return {
				documentId,
				title: documentId,
				chunksCount: 0,
				status: "completed",
			};
		}

		const start = Date.now();
		const interval = 2_000;

		while (Date.now() - start < timeoutMs) {
			const status = await this.weknora.getParseStatus(this.kbId, documentId);
			if (status.status === "completed" || status.status === "failed") {
				return {
					documentId,
					title: documentId,
					chunksCount: status.chunksCount ?? 0,
					status: status.status,
					error: status.error,
				};
			}
			await new Promise((resolve) => setTimeout(resolve, interval));
		}

		return {
			documentId,
			title: documentId,
			chunksCount: 0,
			status: "failed",
			error: "Parse timeout",
		};
	}

	/**
	 * Reparse an existing document with new configuration.
	 */
	async reparse(
		documentId: string,
		processConfig?: Record<string, unknown>,
	): Promise<DocumentParseResult> {
		if (!this.weknora) {
			return {
				documentId,
				title: documentId,
				chunksCount: 0,
				status: "completed",
			};
		}

		await this.weknora.reparseDocument(this.kbId, documentId, processConfig);
		return {
			documentId,
			title: documentId,
			chunksCount: 0,
			status: "pending",
		};
	}

	/**
	 * Fallback: parse locally when WeKnora is not configured.
	 */
	private async fallbackLocalParse(
		ownerId: string,
		file: File,
		_options: DocumentUploadOptions,
	): Promise<DocumentParseResult> {
		const text = await file.text();
		const chunks = chunkText(text, { chunkSize: 800, overlap: 120 });

		const node: KnowledgeNode = {
			id: `kn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
			ownerId,
			categoryId: "imported",
			title: file.name,
			content: text,
			sourceType: "document" as SourceType,
			visibility: "private",
			permissions: { readableBy: [ownerId], usableByAgents: true, commercialUse: false },
			confidence: 0.8,
			createdAt: new Date(),
			updatedAt: new Date(),
			metadata: { chunksCount: chunks.length, parser: "local-fallback" },
		};

		const { indexKnowledgeNode } = await import("./index-pipeline");
		await indexKnowledgeNode(node);

		return {
			documentId: node.id,
			title: node.title,
			chunksCount: chunks.length,
			status: "completed",
		};
	}
}

export const documentParser = new DocumentParser({
	baseUrl: globalThis.process?.env?.WEKNORA_HOST,
	apiKey: globalThis.process?.env?.WEKNORA_API_KEY,
	kbId: globalThis.process?.env?.WEKNORA_KB_ID ?? "default",
});
