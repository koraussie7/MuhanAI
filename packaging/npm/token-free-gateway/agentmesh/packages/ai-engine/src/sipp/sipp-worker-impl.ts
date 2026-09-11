// Stub for @sipp-rs/browser (will be replaced with actual package)
declare const SippClient: any;

let client: any = null;

self.onmessage = async (e: MessageEvent) => {
	const { type, id, ...payload } = e.data;

	try {
		switch (type) {
			case "init":
				client = new SippClient({
					backend: payload.config.backend,
				});
				await client.initialize();
				self.postMessage({ type: "ready", id });
				break;

			case "loadModel":
				if (!client) throw new Error("Client not initialized");
				await client.loadModel(payload.path, {
					format: payload.format,
					onProgress: (progress: number) => {
						self.postMessage({ type: "progress", id, progress });
					},
				});
				self.postMessage({ type: "modelLoaded", id });
				break;

			case "generate":
				if (!client) throw new Error("Client not initialized");

				const { messages, options } = payload;
				let fullText = "";

				await client.generate(messages, {
					maxTokens: options.maxTokens,
					temperature: options.temperature,
					topP: options.topP,
					stream: true,
					onToken: (token: string) => {
						fullText += token;
						self.postMessage({ type: "token", id, token });
					},
				});

				self.postMessage({ type: "complete", id, text: fullText });
				break;

			case "unloadModel":
				if (!client) throw new Error("Client not initialized");
				await client.unloadModel();
				self.postMessage({ type: "modelUnloaded", id });
				break;

			default:
				throw new Error(`Unknown message type: ${type}`);
		}
	} catch (error) {
		self.postMessage({ type: "error", id, error: (error as Error).message });
	}
};
