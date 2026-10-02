declare module "gun" {
  export interface GunInstance {
    get(key: string): GunChain;
    set(data: any): GunReference;
    once(callback: (data: any, id: string) => void): void;
    on(callback: (data: any) => void): void;
    map(): GunChain;
    put(data: any): void;
    delete(): void;
    back(store: string): GunInstance;
    _store: any;
  }
  
  export interface GunChain extends GunInstance {
    set(data: any): GunReference;
    once(callback: (data: any, id: string) => void): void;
    put(data: any): Promise<void>;
    delete(): void;
    val(callback: (data: any) => void): void;
  }
  
  export interface GunReference {
    put(data: any): void;
    set(data: any): GunReference;
    once(callback: (data: any) => void): void;
    val(callback: (data: any) => void): void;
  }
  
  export interface GunConfig {
    peers?: string[];
    file?: boolean;
    web?: any;
    rad?: any;
    axe?: boolean;
    opt?: (opt: any) => void;
  }
  
  export function Gun(config?: GunConfig): GunInstance;
  export function gun(config?: GunConfig): GunInstance;
  
  export default Gun;
}
