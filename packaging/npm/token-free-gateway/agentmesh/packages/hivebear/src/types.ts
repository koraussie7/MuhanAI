export interface HiveBearNodeStatus {
  peerId: string;
  status: "online" | "offline" | "busy";
  capabilities: {
    cpu?: number;
    gpu?: string;
    vramGB?: number;
    models: string[];
  };
  load: number;
  latencyMs: number;
}

export interface HiveBearModelInfo {
  id: string;
  name: string;
  sizeBytes: number;
  quantization?: string;
  local: boolean;
  peers: string[];
}
