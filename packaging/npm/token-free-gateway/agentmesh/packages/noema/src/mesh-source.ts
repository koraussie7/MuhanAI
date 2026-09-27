/**
 * Mesh source transport abstraction.
 *
 * Implements chunked downloading of models from peer-to-peer mesh peers
 * using a transport-agnostic stream connection (libp2p, WebRTC, Iroh, etc.).
 */

export interface MeshPeerConnection {
	dial(peerId: string, protocol: string): Promise<AsyncIterable<Uint8Array>>;
	close(): void;
}

export interface MeshSourceOptions {
	connection: MeshPeerConnection;
	pieceSize?: number; // default 256 KiB
	signal?: AbortSignal;
	onProgress?: (bytesReceived: number, totalExpected?: number) => void;
}

export const DEFAULT_PIECE_SIZE = 256 * 1024; // 256 KiB
export const MESH_DOWNLOAD_PROTOCOL = "/agentmesh/noema/piece/1.0.0";

export interface MeshSourceRef {
	kind: "mesh";
	peer: string;
	contentId: string;
}

/**
 * Downloads content from a mesh peer over a MeshPeerConnection.
 * Yields chunk pieces as AsyncIterable<Uint8Array>.
 */
export async function* fetchFromMeshSource(
	source: MeshSourceRef,
	options: MeshSourceOptions,
): AsyncIterable<Uint8Array> {
	if (options.signal?.aborted) {
		throw options.signal.reason ?? new Error("Download aborted");
	}

	const protocol = `${MESH_DOWNLOAD_PROTOCOL}?contentId=${encodeURIComponent(source.contentId)}`;
	const stream = await options.connection.dial(source.peer, protocol);

	let bytesReceived = 0;
	const pieceSize = options.pieceSize ?? DEFAULT_PIECE_SIZE;

	for await (const chunk of stream) {
		if (options.signal?.aborted) {
			throw options.signal.reason ?? new Error("Download aborted");
		}

		// Ensure we chunk or yield buffer slices consistently
		if (chunk.byteLength <= pieceSize) {
			bytesReceived += chunk.byteLength;
			options.onProgress?.(bytesReceived);
			yield chunk;
		} else {
			let offset = 0;
			while (offset < chunk.byteLength) {
				if (options.signal?.aborted) {
					throw options.signal.reason ?? new Error("Download aborted");
				}
				const nextOffset = Math.min(offset + pieceSize, chunk.byteLength);
				const slice = chunk.subarray(offset, nextOffset);
				bytesReceived += slice.byteLength;
				options.onProgress?.(bytesReceived);
				yield slice;
				offset = nextOffset;
			}
		}
	}
}
