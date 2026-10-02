declare module "ipfs-http-client" {
  export interface CID {
    toString(): string;
  }
  
  export interface AddResult {
    cid: CID;
  }
  
  export interface CatOptions {
    timeout?: number;
  }
  
  export interface IPFSHTTPClient {
    add(content: any): Promise<AddResult>;
    addAll(content: any[]): AsyncIterable<AddResult>;
    cat(cid: string | CID, options?: CatOptions): AsyncIterable<Uint8Array>;
    pin: {
      add(cid: string | CID): Promise<void>;
      rm(cid: string | CID): Promise<void>;
    };
    repo: {
      close(): Promise<void>;
    };
    swarm: {
      connect(addr: string): Promise<void>;
      peers(): Promise<any[]>;
    };
    bootstrap: {
      add(addrs: string[] | string): Promise<void>;
      rm(addrs: string[] | string): Promise<void>;
    };
  }
  
  export interface IPFSConfig {
    url?: string;
    port?: number;
    host?: string;
    protocol?: string;
  }
  
  export function create(config?: IPFSConfig | string): IPFSHTTPClient;
  export function httpClient(config?: IPFSConfig): IPFSHTTPClient;
}
