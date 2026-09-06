import { NoemaClient } from "@agentmesh/noema";
import type { ModelSearchRequest, DownloadStatus, BroadcastRequest } from "@agentmesh/noema";

// CLI path validation: only allow alphanumeric, hyphens, underscores, slashes, dots
const CLI_PATH_REGEX = /^[a-zA-Z0-9_\-\/\.]+$/;
const MAX_CLI_PATH_LENGTH = 256;

function sanitizeCliPath(path: string | undefined): string {
  const defaultPath = "noema";
  if (!path) return defaultPath;
  if (path.length > MAX_CLI_PATH_LENGTH) return defaultPath;
  if (!CLI_PATH_REGEX.test(path)) return defaultPath;
  return path;
}

// Validate and sanitize string inputs to prevent injection
function sanitizeInput(input: string, maxLength = 1024): string {
  if (typeof input !== "string") return "";
  return input.slice(0, maxLength).replace(/[;&|`$(){}[\]\\]/g, "");
}

export class NoemaService {
  private client: NoemaClient;
  private downloadCache = new Map<string, DownloadStatus>();

  constructor(cliPath?: string) {
    const sanitizedPath = sanitizeCliPath(cliPath ?? process.env.NOEMA_CLI);
    this.client = new NoemaClient(sanitizedPath);
  }

  async searchManifests(req: ModelSearchRequest) {
    const result = await this.client.search(req.query, { limit: req.limit ?? 10 });

    if (req.sources && req.sources.length > 0 && result.source === "hybrid") {
      result.manifests = result.manifests.filter((m) =>
        m.sources.some((s) => req.sources!.includes(s.kind as "hf" | "mesh" | "https"))
      );
    }

    return result;
  }

  async startDownload(req: { manifestId: string; destination?: string; priority: string }) {
    const status: DownloadStatus = {
      manifestId: req.manifestId,
      state: "queued",
      progress: 0,
      bytesTransferred: 0,
      totalBytes: 0,
      activePeers: 0,
    };
    this.downloadCache.set(req.manifestId, status);

    Promise.resolve()
      .then(async () => {
        try {
          status.state = "downloading";
          const result = await this.client.download(req.manifestId, req.destination ?? "./models");
          status.state = "verifying";
          status.progress = 0.99;
          status.bytesTransferred = result.bytesTransferred;
          status.totalBytes = result.totalBytes;
          status.activePeers = result.activePeers;

          status.state = "complete";
          status.progress = 1;
        } catch (e) {
          status.state = "failed";
          status.error = e instanceof Error ? e.message : String(e);
        }
      })
      .catch((e) => {
        status.state = "failed";
        status.error = e instanceof Error ? e.message : String(e);
      });

    return status;
  }

  getDownloadStatus(manifestId: string): DownloadStatus | undefined {
    return this.downloadCache.get(manifestId);
  }

  async broadcastModel(req: BroadcastRequest) {
    await this.client.importLocal(req.filePath, {
      name: req.manifestId,
      license: req.license,
      share: !req.private,
    });

    return { success: true, contentId: "" };
  }

  async verifySignature(manifest: Record<string, unknown>, signature: string): Promise<boolean> {
    try {
      // Use the federation-transport ed25519/ECDSA verify function
      const { verify } = await import("@agentmesh/federation-transport");
      
      // Create canonical payload from manifest (sorted keys for determinism)
      const payload = JSON.stringify(manifest, Object.keys(manifest).sort());
      
      // Extract publicKey from manifest if available, otherwise reject
      const publicKey = (manifest as Record<string, unknown>).publicKey as string | undefined;
      if (!publicKey || typeof publicKey !== "string") {
        return false;
      }
      
      if (!signature || typeof signature !== "string") {
        return false;
      }
      
      return await verify(payload, signature, publicKey);
    } catch {
      return false;
    }
  }
}
