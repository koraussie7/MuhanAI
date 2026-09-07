export type NodeType = "core" | "agent" | "peer" | "note" | "tag";

export interface ObsidianFrontmatter {
	title: string;
	author: string;
	peerId?: string;
	created: string;
	tags: string[];
	links: string[];
	summary: string;
	markdown: string;
	latency?: number;
}

export interface CosmicNode {
	id: string;
	label: string;
	type: NodeType;
	peerId?: string;
	x: number;
	y: number;
	vx: number;
	vy: number;
	radius: number;
	pinned?: boolean;
	color?: string;
	frontmatter: ObsidianFrontmatter;
	connectionsCount?: number;
}

export interface CosmicEdge {
	id: string;
	source: string;
	target: string;
	label?: string;
	weight?: number;
}

export interface PeerInfo {
	id: string;
	name: string;
	region: string;
	protocol: "WebRTC" | "libp2p" | "Direct WebSocket";
	latencyMs: number;
	status: "connected" | "syncing" | "idle";
	notesCount: number;
	reputation: number;
	avatarColor: string;
	joinedAt: string;
}

export interface Shockwave {
	id: string;
	x: number;
	y: number;
	radius: number;
	maxRadius: number;
	opacity: number;
	color: string;
}

export interface Star {
	x: number;
	y: number;
	size: number;
	baseAlpha: number;
	twinkleSpeed: number;
	phase: number;
	color: string;
}
