// packages/knowledge-base/src/wasm-colibri/types.ts
export interface EmscriptenModule {
  ccall: (
    func: string,
    returnType: string,
    paramTypes: string[],
    params: any[]
  ) => any;
  cwrap: (
    func: string,
    returnType: string,
    paramTypes: string[]
  ) => (...args: any[]) => any;
  _output_token?: (token: string) => void;
  _generate_complete?: (result: string) => void;
  _main?: () => number;
  HEAP8: Int8Array;
  HEAP16: Int16Array;
  HEAP32: Int32Array;
  HEAPU8: Uint8Array;
  HEAPU16: Uint16Array;
  HEAPU32: Uint32Array;
  HEAPF32: Float32Array;
  HEAPF64: Float64Array;
  allocate: (objects: any[], type: any) => number;
  allocateUTF8: (str: string) => number;
  allocateUTF8OnStack: (str: string) => number;
  Pointer_stringify: (ptr: number) => string;
  UTF8ToString: (ptr: number) => string;
  stringToUTF8: (str: string, outPtr: number, maxBytesToWrite: number) => void;
  getValue: (ptr: number, type: string) => any;
  setValue: (ptr: number, value: any, type: string) => void;
  _free: (ptr: number) => void;
  _malloc: (size: number) => number;
}

export interface ColibriConfig {
  numThreads: number;
  memorySize: number;
  vocabSize: number;
  contextSize: number;
}

export interface InferenceResult {
  tokens: string;
  finishReason: "stop" | "length" | "error";
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ModelInfo {
  cid: string;
  name: string;
  quantization: "int4" | "int8" | "f16" | "bf16";
  totalSize: number; // bytes
  chunkSize: number; // bytes per chunk
}
