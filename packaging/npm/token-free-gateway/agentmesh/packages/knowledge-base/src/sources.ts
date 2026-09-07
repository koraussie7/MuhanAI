export type SourceKind = "web" | "document" | "api" | "user_upload" | "conversation";

export interface KnowledgeSource {
	id: string;
	kind: SourceKind;
	uri?: string;
	title?: string;
	fetchedAt?: Date;
	metadata?: Record<string, unknown>;
}

export class SourceRegistry {
	private sources = new Map<string, KnowledgeSource>();

	register(source: KnowledgeSource): void {
		this.sources.set(source.id, source);
	}

	get(id: string): KnowledgeSource | undefined {
		return this.sources.get(id);
	}

	listByKind(kind: SourceKind): KnowledgeSource[] {
		return Array.from(this.sources.values()).filter((s) => s.kind === kind);
	}
}

export const sourceRegistry = new SourceRegistry();
