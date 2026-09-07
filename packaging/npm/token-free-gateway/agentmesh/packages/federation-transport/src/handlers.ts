/**
 * libp2p v3 stream handlers — `stream.sink` was renamed to `stream.send`
 * (returns boolean, not Promise), and the stream itself is now the
 * AsyncIterable (no `.source` accessor). Handlers receive `(stream, connection)`
 * because libp2p v3 StreamHandler takes the connection as a second arg.
 *
 * Stream type is described structurally to avoid pulling `@libp2p/interface`
 * into this package's dependency surface.
 */

import type { SignedRecord } from "@agentmesh/shared";
import { decodeMessage, encodeMessage, type QueryMessage } from "./protocols/folklore.js";

interface HandlerStream extends AsyncIterable<Uint8Array | Uint8ArrayList> {
	send(data: Uint8Array): boolean;
}

// Minimal structural shape for `Uint8ArrayList` from uint8arraylist. We
// declare it locally to avoid pulling `@multiformats/uint8arraylist` into
// this package's dep surface — the only method we need is `slice()`.
interface Uint8ArrayList {
	slice(start?: number, end?: number): Uint8ArrayList;
}

async function readAll(stream: HandlerStream): Promise<Uint8Array> {
	const chunks: Uint8Array[] = [];
	for await (const chunk of stream) {
		if (chunk instanceof Uint8Array) {
			chunks.push(chunk);
		} else {
			// Uint8ArrayList — flatten its subarray view into a fresh Uint8Array
			const list = chunk as Uint8ArrayList & { subarray(): Uint8Array };
			chunks.push(list.subarray());
		}
	}
	return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

export function createQueryHandler(
	handler: (message: QueryMessage) => Promise<SignedRecord[]>,
): (stream: HandlerStream, connection: unknown) => Promise<void> {
	return async (stream) => {
		try {
			const data = await readAll(stream);
			const message = decodeMessage(data);

			if (message.type === "query") {
				const results = await handler(message);
				const response = encodeMessage({
					type: "query",
					query: message.query,
					embedding: message.embedding,
					results: results.slice(0, 20),
				});
				stream.send(response);
			}
		} catch {
			// ignore query errors
		}
	};
}

export function createPushHandler(
	handler: (records: SignedRecord[]) => Promise<void>,
): (stream: HandlerStream, connection: unknown) => Promise<void> {
	return async (stream) => {
		try {
			const data = await readAll(stream);
			const message = decodeMessage(data);

			if (message.type === "push" && message.records) {
				await handler(message.records);
				const response = encodeMessage({
					type: "push",
					records: [],
					accepted: message.records.length,
				});
				stream.send(response);
			}
		} catch {
			// ignore push errors
		}
	};
}
