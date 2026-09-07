export class NoemaClient {
	cliPath;
	constructor(cliPath = "noema") {
		this.cliPath = cliPath;
	}
	async search(query, opts) {
		const _limit = opts?.limit ?? 10;
		const proc = Bun.spawn([this.cliPath, "hf", "search", query, "--json"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const out = await new Response(proc.stdout).text();
		const code = await proc.exited;
		if (code !== 0) {
			throw new Error(`noema search failed: exit=${code} output=${out}`);
		}
		try {
			return JSON.parse(out);
		} catch {
			return { manifests: [], source: "local" };
		}
	}
	async download(manifestId, dest = "./models") {
		const proc = Bun.spawn([this.cliPath, "download", manifestId, "--into", dest, "--json"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const out = await new Response(proc.stdout).text();
		const code = await proc.exited;
		if (code !== 0) {
			throw new Error(`noema download failed: exit=${code} output=${out}`);
		}
		try {
			return JSON.parse(out);
		} catch {
			return {
				manifestId,
				state: "failed",
				progress: 0,
				bytesTransferred: 0,
				totalBytes: 0,
				activePeers: 0,
				error: `invalid json: ${out.slice(0, 200)}`,
			};
		}
	}
	async status(manifestId) {
		try {
			const proc = Bun.spawn([this.cliPath, "status", manifestId, "--json"], {
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
	async importLocal(filePath, opts) {
		const args = [
			this.cliPath,
			"import-local",
			filePath,
			"--name",
			opts.name,
			"--license",
			opts.license,
		];
		if (opts.share) args.push("--share");
		const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
		const code = await proc.exited;
		if (code !== 0) throw new Error(`noema import-local failed: exit=${code}`);
		return true;
	}
}
//# sourceMappingURL=client.js.map
