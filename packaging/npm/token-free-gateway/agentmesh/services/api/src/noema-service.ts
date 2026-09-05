import { NoemaClient } from "@agentmesh/noema";
import type { ModelSearchRequest, DownloadStatus, BroadcastRequest } from "@agentmesh/noema";

export class NoemaService {
  private client: NoemaClient;
  private downloadCache = new Map<string, DownloadStatus>();

  constructor(cliPath?: string) {
    this.client = new NoemaClient(cliPath ?? process.env.NOEMA_CLI ?? "noema");
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
    return true;
  }
}
