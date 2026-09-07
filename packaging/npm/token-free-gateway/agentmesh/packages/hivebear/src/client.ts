import { spawn } from "@agentmesh/shared";
import type { HiveBearModelInfo, HiveBearNodeStatus } from "./types.js";

// All spawn calls below pass args as an array — array-form args are passed
// directly to execve() and bypass the shell, so user-controlled values
// (port, query, modelId, prompt) cannot be interpreted as shell
// metacharacters. Do NOT change these to string interpolation.

export class HiveBearClient {
	constructor(private cliPath = "hivebear") {}

	async status(): Promise<HiveBearNodeStatus | null> {
		try {
			const proc = await spawn([this.cliPath, "mesh", "status", "--json"], {
				stdout: "pipe",
				stderr: "pipe",
			});
			const [out, , code] = await Promise.all([proc.stdout, proc.stderr, proc.exitCode]);
			if (code !== 0) return null;
			return JSON.parse(out) as HiveBearNodeStatus;
		} catch {
			return null;
		}
	}

	async startMesh(port = 7878): Promise<boolean> {
		const proc = await spawn([this.cliPath, "mesh", "start", `--port=${port}`], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const code = await proc.exitCode;
		return code === 0;
	}

	async searchModels(query: string): Promise<HiveBearModelInfo[]> {
		try {
			const proc = await spawn([this.cliPath, "search", query, "--json"], {
				stdout: "pipe",
				stderr: "pipe",
			});
			const [out, , code] = await Promise.all([proc.stdout, proc.stderr, proc.exitCode]);
			if (code !== 0) return [];
			return JSON.parse(out) as HiveBearModelInfo[];
		} catch {
			return [];
		}
	}

	async runModel(modelId: string, prompt: string, opts?: { stream?: boolean }) {
		const args = [this.cliPath, "mesh", "run", modelId, "--prompt", prompt];
		if (opts?.stream) args.push("--stream");
		const proc = await spawn(args, { stdout: "pipe", stderr: "pipe" });
		const [out, , code] = await Promise.all([proc.stdout, proc.stderr, proc.exitCode]);
		if (code !== 0) throw new Error(`hivebear run failed: ${code}`);
		return out;
	}
}
