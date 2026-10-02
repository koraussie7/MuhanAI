declare module "p2p-media-loader" {
  export interface P2PManagerOptions {
    runtimeOptions?: {
      logging?: boolean;
      useHlsIntegrityValidator?: boolean;
    };
  }
  
  export interface PeerInfo {
    id: string;
    name?: string;
    connected: boolean;
  }
  
  export interface ChunkData {
    byteLength: number;
    data: Uint8Array;
    chunkId: string;
  }
  
  export class P2PManager {
    constructor(options?: P2PManagerOptions);
    
    addPeer(peerId: string, info?: PeerInfo): void;
    removePeer(peerId: string): void;
    getPeers(): PeerInfo[];
    
    shareChunk(chunkId: string, data: Uint8Array): Promise<void>;
    loadChunk(chunkId: string): Promise<Uint8Array>;
    
    getStats(): {
      peersCount: number;
      downloadedFromP2P: number;
      uploadedToP2P: number;
    };
    
    destroy(): void;
  }
}
