import { describe, expect, it } from "vitest";
import {
	handleXLangPeersRequest,
	parseXLangPeerSnapshotJson,
	toXLangPeerSnapshot,
} from "./xlang-peers";

const peer = {
	peerId: "xlang-1",
	endpoint: "wss://peer.example.test/rpc",
	runtime: "xlang",
	capabilities: [{ name: "workflow", kind: "workflow" }],
	supportsStreaming: true,
};

describe("toXLangPeerSnapshot", () => {
	it("accepts a valid peer and rejects unsafe records", () => {
		expect(toXLangPeerSnapshot(peer)).toMatchObject({ peerId: "xlang-1" });
		expect(toXLangPeerSnapshot({ ...peer, endpoint: "ftp://peer.test" })).toBeNull();
		expect(toXLangPeerSnapshot({ ...peer, capabilities: [] })).toBeNull();
		expect(toXLangPeerSnapshot({ ...peer, runtime: "openhydra" })).toBeNull();
	});
});

describe("parseXLangPeerSnapshotJson", () => {
	it("reads a snapshot, dedupes peers, and tolerates bad JSON", () => {
		expect(parseXLangPeerSnapshotJson(JSON.stringify({ peers: [peer, peer] }))).toHaveLength(1);
		expect(parseXLangPeerSnapshotJson("not json")).toEqual([]);
		expect(parseXLangPeerSnapshotJson(undefined)).toEqual([]);
	});
});

describe("handleXLangPeersRequest", () => {
	it("returns the snapshot envelope for GET", async () => {
		const response = handleXLangPeersRequest(new Request("https://muhanai.com/api/xlang/peers"), {
			XLANG_PEERS_JSON: JSON.stringify({ peers: [peer] }),
		});
		expect(response.status).toBe(200);
		const body = (await response.json()) as { peers: unknown[] };
		expect(body.peers).toHaveLength(1);
	});

	it("rejects non-GET methods and unrelated paths", async () => {
		const post = handleXLangPeersRequest(
			new Request("https://muhanai.com/api/xlang/peers", { method: "POST" }),
			{},
		);
		expect(post.status).toBe(405);
		const other = handleXLangPeersRequest(new Request("https://muhanai.com/api/other"), {});
		expect(other.status).toBe(404);
	});
});
