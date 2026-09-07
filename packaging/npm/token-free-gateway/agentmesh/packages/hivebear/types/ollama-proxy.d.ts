import http from "node:http";
export declare class OllamaProxy {
	private readonly target;
	private client;
	constructor(target?: string);
	withClient(client: any): this;
	createHandler(): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;
}
//# sourceMappingURL=ollama-proxy.d.ts.map
