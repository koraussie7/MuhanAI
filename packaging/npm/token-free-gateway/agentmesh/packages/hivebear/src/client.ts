import type { HiveBearNodeStatus, HiveBearModelInfo } from "./types.js";

export class HiveBearClient {
  constructor(private cliPath = "hivebear") {}

  async status(): Promise<HiveBearNodeStatus | null> {
    try {
      const proc = Bun.spawn([this.cliPath, "mesh", "status", "--json"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const out = await new Response(proc.stdout).text();
      const code = await proc.exited;
      if (code !== 0) return null;
      return JSON.parse(out) as HiveBearNodeStatus;
    } catch {
      return null;
    }
  }

  async startMesh(port = 7878): Promise<boolean> {
    const proc = Bun.spawn([this.cliPath, "mesh", "start", `--port=${port}`], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await proc.exited;
    return code === 0;
  }

  async searchModels(query: string): Promise<HiveBearModelInfo[]> {
    try {
      const proc = Bun.spawn([this.cliPath, "search", query, "--json"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const out = await new Response(proc.stdout).text();
      const code = await proc.exited;
      if (code !== 0) return [];
      return JSON.parse(out) as HiveBearModelInfo[];
    } catch {
      return [];
    }
  }

  async runModel(modelId: string, prompt: string, opts?: { stream?: boolean }) {
    const args = [this.cliPath, "mesh", "run", modelId, "--prompt", prompt];
    if (opts?.stream) args.push("--stream");
    const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;
    if (code !== 0) throw new Error(`hivebear run failed: ${code}`);
    return out;
  }
}
