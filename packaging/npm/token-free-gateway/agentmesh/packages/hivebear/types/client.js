export class HiveBearClient {
	cliPath;
	constructor(cliPath = "hivebear") {
		this.cliPath = cliPath;
	}
	async status() {
		try {
			const proc = Bun.spawn([this.cliPath, "mesh", "status", "--json"], {
				stdout: "pipe",
				stderr: "pipe",
			});
			const out = await new Response(proc.stdout).text();
			const code = await proc.exited;
			if (code !== 0) return null;
			return JSON.parse(out);
		} catch {
			return null;
		}
	}
	async startMesh(port = 7878) {
		const proc = Bun.spawn([this.cliPath, "mesh", "start", `--port=${port}`], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const code = await proc.exited;
		return code === 0;
	}
	async searchModels(query) {
		try {
			const proc = Bun.spawn([this.cliPath, "search", query, "--json"], {
				stdout: "pipe",
				stderr: "pipe",
			});
			const out = await new Response(proc.stdout).text();
			const code = await proc.exited;
			if (code !== 0) return [];
			return JSON.parse(out);
		} catch {
			return [];
		}
	}
	async runModel(modelId, prompt, opts) {
		const args = [this.cliPath, "mesh", "run", modelId, "--prompt", prompt];
		if (opts?.stream) args.push("--stream");
		const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
		const out = await new Response(proc.stdout).text();
		const code = await proc.exited;
		if (code !== 0) throw new Error(`hivebear run failed: ${code}`);
		return out;
	}
}
//# sourceMappingURL=client.js.map
