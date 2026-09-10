import type {
	CategoryContext,
	FederationNode,
	FederationSyncResult,
	KnowledgeNode,
	SignedRecord,
} from "@agentmesh/shared-types";
import type { FederationMesh } from "./folklore-federation.js";

export interface GraphNode {
	id: string;
	type: "user" | "domain" | "subdomain" | "jurisdiction" | "knowledge" | "expertise";
	label: string;
	metadata?: Record<string, unknown>;
}

export interface GraphEdge {
	id: string;
	from: string;
	to: string;
	relation: string;
	weight?: number;
}

export class KnowledgeGraph {
	private nodes = new Map<string, GraphNode>();
	private edges: GraphEdge[] = [];
	private federation?: FederationMesh;

	setFederation(federation: FederationMesh): void {
		this.federation = federation;
	}

	upsertNode(node: GraphNode): void {
		this.nodes.set(node.id, node);
	}

	connect(from: string, to: string, relation: string, weight = 1): void {
		const id = `${from}->${relation}->${to}`;
		const existing = this.edges.find((e) => e.id === id);
		if (existing) {
			existing.weight = (existing.weight ?? 1) + weight;
		} else {
			this.edges.push({ id, from, to, relation, weight });
		}
	}

	async connectKnowledge(params: {
		userId: string;
		category: CategoryContext;
		knowledge: KnowledgeNode;
	}): Promise<void> {
		const { userId, category, knowledge } = params;

		const userNodeId = `user:${userId}`;
		this.upsertNode({ id: userNodeId, type: "user", label: userId });

		const domainId = `domain:${category.domain}`;
		this.upsertNode({
			id: domainId,
			type: "domain",
			label: category.domain,
		});
		this.connect(userNodeId, domainId, "has_expertise");

		if (category.subdomain) {
			const subId = `subdomain:${category.domain}.${category.subdomain}`;
			this.upsertNode({
				id: subId,
				type: "subdomain",
				label: category.subdomain,
			});
			this.connect(domainId, subId, "has_subdomain");
			this.connect(userNodeId, subId, "has_expertise");
		}

		if (category.jurisdiction) {
			for (const j of category.jurisdiction) {
				const jId = `jurisdiction:${j}`;
				this.upsertNode({ id: jId, type: "jurisdiction", label: j });
				this.connect(userNodeId, jId, "operates_in");
				this.connect(domainId, jId, "applies_to");
			}
		}

		const knId = `knowledge:${knowledge.id}`;
		this.upsertNode({
			id: knId,
			type: "knowledge",
			label: knowledge.title,
			metadata: { categoryId: knowledge.categoryId },
		});
		this.connect(userNodeId, knId, "owns");
		this.connect(knId, domainId, "about");
	}

	getNeighbors(nodeId: string, relation?: string): GraphNode[] {
		const related = this.edges.filter(
			(e) => (e.from === nodeId || e.to === nodeId) && (!relation || e.relation === relation),
		);
		const ids = new Set<string>();
		for (const e of related) {
			if (e.from !== nodeId) ids.add(e.from);
			if (e.to !== nodeId) ids.add(e.to);
		}
		return Array.from(ids)
			.map((id) => this.nodes.get(id))
			.filter((n): n is GraphNode => !!n);
	}

	findRelatedUsers(userId: string, domain?: string): string[] {
		const userNode = `user:${userId}`;
		const domainNodes = domain
			? [`domain:${domain}`]
			: this.getNeighbors(userNode, "has_expertise").map((n) => n.id);

		const relatedUsers = new Set<string>();
		for (const d of domainNodes) {
			const users = this.edges
				.filter((e) => e.to === d && e.relation === "has_expertise" && e.from.startsWith("user:"))
				.map((e) => e.from.replace("user:", ""));
			users.forEach((u) => {
				if (u !== userId) relatedUsers.add(u);
			});
		}
		return Array.from(relatedUsers);
	}

	async federatedSearch(queryEmbedding: number[], queryText: string): Promise<SignedRecord[]> {
		if (!this.federation) {
			return [];
		}
		return this.federation.query(queryEmbedding, queryText);
	}

	async syncFederation(): Promise<FederationSyncResult> {
		if (!this.federation) {
			return { pulled: 0, pushed: 0, peers: [] };
		}
		return this.federation.sync();
	}

	addFederationPeer(peer: FederationNode): void {
		if (this.federation) {
			this.federation.addPeer(peer);
		}
	}

	getFederationPeers(): FederationNode[] {
		if (!this.federation) {
			return [];
		}
		return this.federation.getPeers();
	}
}

export const knowledgeGraph = new KnowledgeGraph();
