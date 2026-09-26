import { beforeEach, describe, expect, it, vi } from "vitest";
import { KuboHttpIpfsAdapter } from "./kubo.js";

describe("KuboHttpIpfsAdapter", () => {
	const baseUrl = "http://127.0.0.1:15001";
	let adapter: KuboHttpIpfsAdapter;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		adapter = new KuboHttpIpfsAdapter(baseUrl);
		fetchMock = vi.fn();
		globalThis.fetch = fetchMock as any;
	});

	it("uploads a bundle via /api/v0/add and returns the wrapped root CID", async () => {
		// Kubo returns one JSON object per file (and any intermediate
		// directories), then a final "" (root) entry. The rootHash we return
		// is the last ""-named entry, which is the directory CID.
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({ Name: "index.html", Hash: "QmFile1", Size: "120" }) +
					"\n" +
					JSON.stringify({ Name: ".well-known", Hash: "QmDotDir", Size: "60" }) +
					"\n" +
					JSON.stringify({ Name: ".well-known/mcp.json", Hash: "QmFile2", Size: "60" }) +
					"\n" +
					JSON.stringify({ Name: "", Hash: "QmRootDir", Size: "240" }) +
					"\n",
				{ status: 200, headers: { "content-type": "application/json" } },
			),
		);

		const result = await adapter.add({
			"index.html": "<h1>hi</h1>",
			".well-known/mcp.json": '{"name":"test"}',
		});

		expect(result.cid).toBe("QmRootDir");
		expect(result.size).toBe(480);
		expect(result.rootName).toBe("wrap");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(`${baseUrl}/api/v0/add?wrap-with-directory=true`);
		expect(init.method).toBe("POST");
		expect(init.body).toBeInstanceOf(FormData);
	});

	it("calls /api/v0/pin/add with the cid on pin", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ Pins: ["QmX"] }), { status: 200 }),
		);
		const result = await adapter.pin("QmX");
		expect(result.success).toBe(true);
		expect(result.pinStatus).toBe("pinned");
		expect(fetchMock.mock.calls[0]?.[0]).toBe(`${baseUrl}/api/v0/pin/add?arg=QmX&recursive=true`);
	});

	it("reports failed pin on non-2xx", async () => {
		fetchMock.mockResolvedValueOnce(new Response("locked", { status: 500 }));
		const result = await adapter.pin("QmY");
		expect(result.success).toBe(false);
		expect(result.pinStatus).toBe("failed");
		expect(result.error).toContain("500");
	});

	it("reports unpinned status when /pin/ls returns 500", async () => {
		fetchMock.mockResolvedValueOnce(new Response("not pinned", { status: 500 }));
		const status = await adapter.status("QmZ");
		expect(status.status).toBe("unpinned");
	});

	it("reads baseUrl from constructor", () => {
		expect(new KuboHttpIpfsAdapter("http://1.2.3.4:5001/").endpoint).toBe("http://1.2.3.4:5001");
	});
});
