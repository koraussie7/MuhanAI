/**
 * IPFS Pinning Service adapter for the One-Click Factory System.
 * Handles content pinning and retrieval via IPFS (Kubo/Helia/Pinning Service).
 *
 * In production, uses a real IPFS node or pinning service API.
 * In development/offline mode, uses MockIpfsAdapter for deterministic testing.
 */

export interface PinStatus {
	cid: string;
	status: "pinned" | "pinning" | "failed" | "unpinned";
	replication: number;
	lastCheck: number;
}

export interface PinResult {
	success: boolean;
	cid: string;
	pinStatus: PinStatus["status"];
	size?: number;
	error?: string;
}

export interface AddResult {
	/** CID returned by the IPFS node (v0/Qm… or v1/bafy…) */
	cid: string;
	/** Aggregate size of all files in the added bundle, in bytes */
	size: number;
	/** Name of the root directory if the adapter wrapped the bundle */
	rootName?: string;
}

export interface IpfsAdapter {
	/** Add content to IPFS, returning the root CID. */
	add(content: Record<string, string | Uint8Array>): Promise<AddResult>;
	/** Pin content (CID) to the IPFS network */
	pin(cid: string, options?: { replication?: number }): Promise<PinResult>;
	/** Unpin content (garbage collection) */
	unpin(cid: string): Promise<PinResult>;
	/** Check pin status */
	status(cid: string): Promise<PinStatus>;
	/** List all pinned CIDs */
	listPins(limit?: number): Promise<PinStatus[]>;
}
