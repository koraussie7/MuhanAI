import { spawn } from "@agentmesh/shared";
import type { DownloadStatus, ModelSearchResult } from "./types.js";

// All spawn calls below pass args as an array — array-form args are passed
// directly to execve() and bypass the shell, so user-controlled values
// (query, manifestId, filePath, etc.) cannot be interpreted as shell
// metacharacters. Do NOT change these to string interpolation.

export class NoemaClient {
	constructor(private cliPath = "noema") {}

	async search(query: string, opts?: { limit?: number }): Promise<ModelSearchResult> {
		const _limit = opts?.limit ?? 10;
		const proc = await spawn([this.cliPath, "hf", "search", query, "--json"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const [out, , code] = await Promise.all([proc.stdout, proc.stderr, proc.exitCode]);
		if (code !== 0) {
			throw new Error(`noema search failed: exit=${code} output=${out}`);
		}
		try {
			return JSON.parse(out) as ModelSearchResult;
		} catch {
			return { manifests: [], source: "local" };
		}
	}

	async download(manifestId: string, dest = "./models"): Promise<DownloadStatus> {
		const proc = await spawn([this.cliPath, "download", manifestId, "--into", dest, "--json"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const [out, , code] = await Promise.all([proc.stdout, proc.stderr, proc.exitCode]);
		if (code !== 0) {
			throw new Error(`noema download failed: exit=${code} output=${out}`);
		}
		try {
			return JSON.parse(out) as DownloadStatus;
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

	async status(manifestId: string): Promise<DownloadStatus | null> {
		try {
			const proc = await spawn([this.cliPath, "status", manifestId, "--json"], {
				stdout: "pipe",
				stderr: "pipe",
			});
			const [out, , code] = await Promise.all([proc.stdout, proc.stderr, proc.exitCode]);
			if (code !== 0) return null;
			return JSON.parse(out) as DownloadStatus;
		} catch {
			return null;
		}
	}

	async importLocal(filePath: string, opts: { name: string; license: string; share?: boolean }) {
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
		const proc = await spawn(args, { stdout: "pipe", stderr: "pipe" });
		const code = await proc.exitCode;
		if (code !== 0) throw new Error(`noema import-local failed: exit=${code}`);
		return true;
	}
}
