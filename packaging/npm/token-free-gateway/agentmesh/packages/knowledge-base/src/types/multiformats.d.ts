declare module "multiformats/types" {
  export interface CID {
    toString(): string;
    toBytes(): Uint8Array;
    version: number;
    code: number;
    multihash: any;
  }
}
