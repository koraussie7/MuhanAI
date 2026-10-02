# WASM Colibri Build Pipeline

## Overview
Port the Colibri C inference engine to WebAssembly (WASM) so it can run in browsers via `threads` and `SharedArrayBuffer` for multi-threaded CPU inference.

## Build Steps

### 1. Emscripten Environment
```bash
# Via Docker (no local install needed)
docker run --rm -v $(pwd):/src -w /src \
  emscripten/emsdk \
  emcc src/colibri.c -o dist/colibri.js \
  -s WASM=1 \
  -s EXPORTED_RUNTIME_METHODS="['ccall', 'cwrap']" \
  -s EXPORTED_FUNCTIONS="['_main', '_colibri_init', '_colibri_load_model', '_colibri_generate']" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=268435456 \
  -s MAXIMUM_MEMORY=1073741824 \
  -s ASSERTIONS=1 \
  -lm
```

### 2. C API Wrapper
Create a thin C wrapper exposing functions to JS:
```c
// colibri_wasm.c
#include "colibri.h"

EM_JS(void, js_output_callback, (const char* str), {
    // Call JS function to receive token stream
    Module._output_token(str);
});

int colibri_init() {
    return colibri_engine_init();
}

int colibri_load_model(const char* model_path) {
    return colibri_model_load(model_path);
}

int colibri_generate(const char* prompt) {
    js_output_callback("Generating...");
    return colibri_inference_run(prompt);
}
```

### 3. JS Glue
Generate TypeScript bindings:
```typescript
// src/wasm-colibri/colibri-bridge.ts
import type { EmscriptenModule } from "./types";

export class ColibriWASM {
  private module: EmscriptenModule | null = null;
  private memory: WebAssembly.Memory;

  async init(wasmPath: string): Promise<void> {
    this.module = await this.loadEmscriptenModule(wasmPath);
  }

  async loadModel(modelCid: string): Promise<boolean> {
    // Stream model chunks from IPFS → WASM memory
    return this.module!.cwrap('colibri_load_model', 'number', ['string'])(modelCid);
  }

  async generate(prompt: string): Promise<string> {
    // Multi-threaded inference via SharedArrayBuffer
    return new Promise((resolve) => {
      this.module!._output_token = (token: string) => {
        // Stream tokens to caller
      };
      
      this.module!._generate_complete = (result: string) => {
        resolve(result);
      };
      
      this.module!.cwrap('colibri_generate', 'number', ['string'])(prompt);
    });
  }

  private async loadEmscriptenModule(path: string): Promise<EmscriptenModule> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = path;
      script.onload = () => resolve(window.Module);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
}
```

## Integration with P2P Memory

Once the WASM module is loaded:
1. Use `P2PMemoryStream` to receive model weights in chunks
2. Feed chunks into WASM linear memory
3. Run inference in web worker (offscreen canvas)
4. Stream tokens back via `SharedArrayBuffer`
