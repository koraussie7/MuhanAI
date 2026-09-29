/**
 * Model download orchestrator.
 *
 * Downloads model content from manifest sources into a WritableStream,
 * verifying content hash integrity against the ModelManifest.
 */

import type { MeshPeerConnection } from "./mesh-source.js";
import { resolveSource } from "./source-resolver.js";
import type { DownloadStatus, ManifestSource, ModelManifest } from "./types.js";
import { verifyFile } from "./verify.js";

export interface DownloadOptions {
	connection?: MeshPeerConnection;
	priority?: "speed" | "privacy" | "balanced";
	signal?: AbortSignal;
	onStatus?: (status: DownloadStatus) => void;
	customFetcher?: (
		source: ManifestSource,
		signal?: AbortSignal,
	) => Promise<AsyncIterable<Uint8Array>> | AsyncIterable<Uint8Array>;
}

/**
 * Downloads model data described by a ModelManifest into a WritableStream,
 * verifying hash integrity upon completion.
 */
export async function downloadFromManifest(
	manifest: ModelManifest,
	destination: WritableStream<Uint8Array>,
	options: DownloadOptions = {},
): Promise<DownloadStatus> {
	const totalBytes = manifest.sizeBytes;
	const activePeers = manifest.sources.filter((s) => s.kind === "mesh").length;

	let status: DownloadStatus = {
		manifestId: manifest.id,
		state: "queued",
		progress: 0,
		bytesTransferred: 0,
		totalBytes,
		activePeers,
	};
	options.onStatus?.(status);

	if (options.signal?.aborted) {
		status = {
			...status,
			state: "failed",
			error: options.signal.reason?.message ?? "Download aborted",
		};
		options.onStatus?.(status);
		return status;
	}

	const writer = destination.getWriter();
	const receivedChunks: Buffer[] = [];

	try {
		status = {
			...status,
			state: "downloading",
		};
		options.onStatus?.(status);

		const { stream } = await resolveSource(manifest.sources, {
			connection: options.connection,
			priority: options.priority,
			signal: options.signal,
			customFetcher: options.customFetcher,
			onProgress: (bytesReceived) => {
				const progress = totalBytes > 0 ? Math.min(1, bytesReceived / totalBytes) : 0;
				status = {
					...status,
					progress,
					bytesTransferred: bytesReceived,
				};
				options.onStatus?.(status);
			},
		});

		for await (const chunk of stream) {
			if (options.signal?.aborted) {
				throw options.signal.reason ?? new Error("Download aborted");
			}
			await writer.write(chunk);
			receivedChunks.push(Buffer.from(chunk));
		}

		// Transition to verifying state
		status = {
			...status,
			state: "verifying",
			progress: 1,
			bytesTransferred: receivedChunks.reduce((acc, c) => acc + c.byteLength, 0),
		};
		options.onStatus?.(status);

		const concatenated = Buffer.concat(receivedChunks);
		const fileBytes = new Uint8Array(
			concatenated.buffer,
			concatenated.byteOffset,
			concatenated.byteLength,
		);

		const verification = verifyFile(manifest, fileBytes);
		if (!verification.ok) {
			throw new Error(`Integrity verification failed: ${verification.reason}`);
		}

		await writer.close();

		status = {
			...status,
			state: "complete",
			progress: 1,
		};
		options.onStatus?.(status);
		return status;
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		try {
			await writer.abort(err);
		} catch {
			// ignore abort errors if already aborted/closed
		}

		status = {
			...status,
			state: "failed",
			error: errorMessage,
		};
		options.onStatus?.(status);
		return status;
	}
}
