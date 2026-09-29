/**
 * Resource descriptor — the single registry-facing shape.
 *
 * R1 (agent-registry) stores these; R2 (ard-adapter) discovers them;
 * R3 (a2a-adapter) turns `kind: "agent"` rows into Agent Cards.
 * Everything else in the mesh is a projection of this type.
 */
import type { RiskLevel, Visibility } from "./index.js";

export type ResourceKind = "agent" | "mcp" | "model" | "peer" | "compute";

export type ResourceStatus = "online" | "offline" | "degraded";

export interface ResourceDescriptor {
	/** Globally unique, stable across re-registration. */
	id: string;
	kind: ResourceKind;
	name: string;
	description?: string;
	/** Free-form capability tags, e.g. ["ssh-exec", "gguf", "gpu-a100"]. */
	capabilities: string[];
	/** Network-reachable entry point. Opaque to the registry itself. */
	endpoint?: string;
	protocol?: "mcp" | "http" | "ws" | "grpc" | "libp2p";
	status: ResourceStatus;
	riskLevel?: RiskLevel;
	visibility: Visibility;
	/** Owner id — always resolved server-side, never taken from the body. */
	ownerId: string;
	/** Free-form metadata that does not deserve its own field. */
	metadata?: Record<string, unknown>;
	createdAt: number;
	updatedAt: number;
	lastSeen?: number;
}
