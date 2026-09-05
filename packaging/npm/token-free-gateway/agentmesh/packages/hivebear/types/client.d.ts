import type { HiveBearNodeStatus, HiveBearModelInfo } from "./types.js";
export declare class HiveBearClient {
    private cliPath;
    constructor(cliPath?: string);
    status(): Promise<HiveBearNodeStatus | null>;
    startMesh(port?: number): Promise<boolean>;
    searchModels(query: string): Promise<HiveBearModelInfo[]>;
    runModel(modelId: string, prompt: string, opts?: {
        stream?: boolean;
    }): Promise<string>;
}
//# sourceMappingURL=client.d.ts.map