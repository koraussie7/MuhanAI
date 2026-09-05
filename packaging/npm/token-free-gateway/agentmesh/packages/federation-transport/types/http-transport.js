export class HttpTransport {
    peerId;
    baseUrl;
    constructor(options) {
        this.peerId = options.peerId;
        this.baseUrl = options.listenAddr ?? "http://127.0.0.1:3001";
    }
    async start() {
        // HTTP transport doesn't need to start a listener
    }
    async stop() {
        // nothing to stop
    }
    async query(peerId, query, _embedding) {
        try {
            const target = new URL("/api/knowledge/folklore/query", `${this.baseUrl}/`);
            const res = await fetch(target.toString(), {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ query, embedding: _embedding ?? [] }),
            });
            if (!res.ok)
                return [];
            const data = (await res.json());
            return data.results ?? [];
        }
        catch {
            return [];
        }
    }
    async push(_peerId, records) {
        try {
            const target = new URL("/api/knowledge/folklore/ingest", `${this.baseUrl}/`);
            let pushed = 0;
            for (const record of records) {
                const res = await fetch(target.toString(), {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(record),
                });
                if (res.ok)
                    pushed++;
            }
            return pushed;
        }
        catch {
            return 0;
        }
    }
    getPeers() {
        return [];
    }
    async addPeer(_address) {
        // no-op for HTTP
    }
    async removePeer(_peerId) {
        // no-op for HTTP
    }
}
//# sourceMappingURL=http-transport.js.map