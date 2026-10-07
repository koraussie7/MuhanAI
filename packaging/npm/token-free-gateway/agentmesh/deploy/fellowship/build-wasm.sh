#!/bin/bash
# Build minimal Colibri WASM module for browser inference
# Compiles only CPU tensor ops, tokenizer, and sampling - no GPU backends

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../../../" && pwd)"
CO_DIR="$PROJECT_ROOT/vendor/colibri/c"
OUT_DIR="$SCRIPT_DIR/public/colibri"

mkdir -p "$OUT_DIR"

echo "Building minimal Colibri WASM module..."
cd "$CO_DIR"

# Use the minimal WASM wrapper
SOURCES=(
    colibri_wasm.c
)

# Export symbols needed by the JS wrapper
EXPORTS=(
    "_malloc"
    "_free"
    "_colibri_init"
    "_colibri_generate"
    "_colibri_free"
    "_colibri_tokenize"
    "_colibri_forward"
    "_colibri_sample"
    "_colibri_model_load"
    "_colibri_model_unload"
)

EXPORTED_RUNTIME=(
    "ccall"
    "cwrap"
    "getValue"
    "setValue"
    "UTF8ToString"
    "stringToUTF8"
    "HEAPU8"
    "HEAPF32"
    "HEAP32"
)

# Join arrays
EXPORTS_STR=$(IFS=,; echo "${EXPORTS[*]}")
RUNTIME_STR=$(IFS=,; echo "${EXPORTED_RUNTIME[*]}")

# Build with Emscripten
emcc -O3 -s WASM=1 \
    -s EXPORTED_FUNCTIONS="[$EXPORTS_STR]" \
    -s EXPORTED_RUNTIME_METHODS="[$RUNTIME_STR]" \
    -s MODULARIZE=1 \
    -s EXPORT_NAME=createColibriModule \
    -s ENVIRONMENT=web,worker \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s INITIAL_MEMORY=64MB \
    -s MAXIMUM_MEMORY=512MB \
    -s PTHREAD_POOL_SIZE=1 \
    -s USE_PTHREADS=0 \
    -s PROXY_TO_PTHREAD=0 \
    -s STACK_OVERFLOW_CHECK=2 \
    -I. \
    -DWASM_BUILD \
    "${SOURCES[@]}" \
    -o "$OUT_DIR/colibri.js" \
    2>&1 | tee "$OUT_DIR/build.log"

# Check result
if [ -f "$OUT_DIR/colibri.js" ] && [ -f "$OUT_DIR/colibri.wasm" ]; then
    echo "✅ WASM build successful!"
    echo "  JS:   $OUT_DIR/colibri.js"
    echo "  WASM: $OUT_DIR/colibri.wasm"
    ls -lh "$OUT_DIR/"
else
    echo "❌ Build failed. Check $OUT_DIR/build.log"
    cat "$OUT_DIR/build.log"
    exit 1
fi