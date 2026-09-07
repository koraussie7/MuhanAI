export const QUERY_PROTOCOL = "/folklore/query/1.0.0";
export const PUSH_PROTOCOL = "/folklore/push/1.0.0";
export function encodeMessage(message) {
	const text = JSON.stringify(message);
	return new TextEncoder().encode(text);
}
export function decodeMessage(data) {
	const text = new TextDecoder().decode(data);
	return JSON.parse(text);
}
//# sourceMappingURL=folklore.js.map
