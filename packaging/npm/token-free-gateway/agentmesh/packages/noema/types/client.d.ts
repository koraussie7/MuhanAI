import type { DownloadStatus, ModelSearchResult } from "./types.js";
export declare class NoemaClient {
	private cliPath;
	constructor(cliPath?: string);
	search(
		query: string,
		opts?: {
			limit?: number;
		},
	): Promise<ModelSearchResult>;
	download(manifestId: string, dest?: string): Promise<DownloadStatus>;
	status(manifestId: string): Promise<DownloadStatus | null>;
	importLocal(
		filePath: string,
		opts: {
			name: string;
			license: string;
			share?: boolean;
		},
	): Promise<boolean>;
}
//# sourceMappingURL=client.d.ts.map
