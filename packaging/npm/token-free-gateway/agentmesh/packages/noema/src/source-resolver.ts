/**
 * Source resolver for ModelManifest sources.
 *
 * Tries manifest sources according to policy/priority, dispatching to
 * the appropriate fetcher (mesh, https, hf).
 */

import { fetchFromMeshSource, type MeshPeerConnection } from "./mesh-source.js";
import type { ManifestSource } from "./types.js";

export interface SourceResolverOptions {
	connection?: MeshPeerConnection;
	priority?: "speed" | "privacy" | "balanced";
	signal?: AbortSignal;
	onProgress?: (bytesReceived: number, totalExpected?: number) => void;
	customFetcher?: (
		source: ManifestSource,
		signal?: AbortSignal,
	) => Promise<AsyncIterable<Uint8Array>> | AsyncIterable<Uint8Array>;
}

export interface ResolvedSourceResult {
	source: ManifestSource;
	stream: AsyncIterable<Uint8Array>;
}

/**
 * Orders sources according to priority strategy:
 * - "privacy": mesh first (P2P), then hf / https
 * - "speed": https/hf first (direct CDN / HTTP mirrors), then mesh
 * - "balanced": mesh first if available, then fallback to CDN
 */
export function orderSources(
	sources: ManifestSource[],
	priority: "speed" | "privacy" | "balanced" = "balanced",
): ManifestSource[] {
	const copy = [...sources];
	switch (priority) {
		case "privacy":
			return copy.sort((a, b) => {
				const score = (s: ManifestSource) => (s.kind === "mesh" ? 0 : s.kind === "hf" ? 1 : 2);
				return score(a) - score(b);
			});
		case "speed":
			return copy.sort((a, b) => {
				const score = (s: ManifestSource) => (s.kind === "https" ? 0 : s.kind === "hf" ? 1 : 2);
				return score(a) - score(b);
			});
		case "balanced":
		default:
			return copy.sort((a, b) => {
				const score = (s: ManifestSource) => (s.kind === "mesh" ? 0 : s.kind === "https" ? 1 : 2);
				return score(a) - score(b);
			});
	}
}

/**
 * Resolves sources by attempting them in priority order.
 * Returns the first successfully initiated stream and the source used.
 */
export async function resolveSource(
	sources: ManifestSource[],
	options: SourceResolverOptions = {},
): Promise<ResolvedSourceResult> {
	if (!sources || sources.length === 0) {
		throw new Error("No sources available to resolve");
	}

	const ordered = orderSources(sources, options.priority);
	const errors: Array<{ source: ManifestSource; error: Error }> = [];

	for (const source of ordered) {
		if (options.signal?.aborted) {
			throw options.signal.reason ?? new Error("Source resolution aborted");
		}

		try {
			if (options.customFetcher) {
				const stream = await options.customFetcher(source, options.signal);
				return { source, stream };
			}

			if (source.kind === "mesh") {
				if (!options.connection) {
					throw new Error("MeshPeerConnection required to fetch from mesh source");
				}
				const stream = fetchFromMeshSource(source, {
					connection: options.connection,
					signal: options.signal,
					onProgress: options.onProgress,
				});
				return { source, stream };
			}

			if (source.kind === "https") {
				const res = await fetch(source.url, { signal: options.signal });
				if (!res.ok) {
					throw new Error(`HTTP ${res.status} ${res.statusText}`);
				}
				if (!res.body) {
					throw new Error("HTTP response body is null");
				}
				const body = res.body;
				async function* nodeWebStreamToIterator(): AsyncIterable<Uint8Array> {
					const reader = body.getReader();
					try {
						while (true) {
							const { done, value } = await reader.read();
							if (done) break;
							if (value) {
								yield value;
							}
						}
					} finally {
						reader.releaseLock();
					}
				}
				return { source, stream: nodeWebStreamToIterator() };
			}

			if (source.kind === "hf") {
				const revision = source.revision ?? "main";
				const hfUrl = `https://huggingface.co/${source.repo}/resolve/${revision}/${source.file}`;
				const res = await fetch(hfUrl, { signal: options.signal });
				if (!res.ok) {
					throw new Error(`HuggingFace HTTP ${res.status} ${res.statusText}`);
				}
				if (!res.body) {
					throw new Error("HuggingFace response body is null");
				}
				const body = res.body;
				async function* hfStreamToIterator(): AsyncIterable<Uint8Array> {
					const reader = body.getReader();
					try {
						while (true) {
							const { done, value } = await reader.read();
							if (done) break;
							if (value) {
								yield value;
							}
						}
					} finally {
						reader.releaseLock();
					}
				}
				return { source, stream: hfStreamToIterator() };
			}

			throw new Error(`Unsupported source kind: ${(source as { kind: string }).kind}`);
		} catch (err) {
			errors.push({ source, error: err instanceof Error ? err : new Error(String(err)) });
		}
	}

	const errorMsgs = errors.map((e) => `[${e.source.kind}] ${e.error.message}`).join("; ");
	throw new Error(`All sources failed to resolve: ${errorMsgs}`);
}
