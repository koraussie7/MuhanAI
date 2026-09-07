import { decodeMessage, encodeMessage } from "./protocols/folklore.js";
export function createQueryHandler(handler) {
	return async (stream) => {
		try {
			const chunks = [];
			for await (const chunk of stream) {
				chunks.push(chunk);
			}
			const data = Buffer.concat(chunks.map((c) => Buffer.from(c)));
			const message = decodeMessage(data);
			if (message.type === "query") {
				const results = await handler(message);
				const response = encodeMessage({
					type: "query",
					query: message.query,
					embedding: message.embedding,
					results: results.slice(0, 20),
				});
				await stream.sink(response);
			}
		} catch {
			// ignore query errors
		}
	};
}
export function createPushHandler(handler) {
	return async (stream) => {
		try {
			const chunks = [];
			for await (const chunk of stream) {
				chunks.push(chunk);
			}
			const data = Buffer.concat(chunks.map((c) => Buffer.from(c)));
			const message = decodeMessage(data);
			if (message.type === "push" && message.records) {
				await handler(message.records);
				const response = encodeMessage({
					type: "push",
					records: [],
					accepted: message.records.length,
				});
				await stream.sink(response);
			}
		} catch {
			// ignore push errors
		}
	};
}
//# sourceMappingURL=handlers.js.map
