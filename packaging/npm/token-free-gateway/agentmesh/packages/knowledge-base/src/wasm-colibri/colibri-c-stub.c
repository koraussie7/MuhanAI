// packages/knowledge-base/src/wasm-colibri/colibri-c-stub.c
/*
 * Colibri WASM stub - C source for browser/WebAssembly build
 * This is a minimal stub implementation for testing.
 * Replace with actual Colibri C source from JustVugg/colibri
 */

#include <emscripten.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    int initialized;
    void* model_data;
    int model_loaded;
    int vocab_size;
    int context_size;
    int num_threads;
} ColibriState;

static ColibriState g_state = {0};

/* Exported functions callable from JavaScript */

EMSCRIPTEN_KEEPALIVE
int colibri_init() {
    g_state.initialized = 1;
    g_state.model_loaded = 0;
    g_state.vocab_size = 152064;
    g_state.context_size = 8192;
    g_state.num_threads = 4;
    return 1;
}

EMSCRIPTEN_KEEPALIVE
int colibri_load_model(const char* model_path, int model_size) {
    if (!g_state.initialized) return -1;
    
    g_state.model_data = malloc(model_size);
    g_state.model_loaded = 1;
    return 1;
}

EMSCRIPTEN_KEEPALIVE
int colibri_generate(const char* prompt) {
    if (!g_state.model_loaded) return -1;
    return 0;
}

EMSCRIPTEN_KEEPALIVE
void colibri_set_callbacks(
    void (*token_cb)(const char*),
    void (*done_cb)(const char*)
) {
    /* Set JS callbacks for token streaming */
}

EMSCRIPTEN_KEEPALIVE
int colibri_get_memory_usage() {
    return sizeof(g_state) + (g_state.model_data ? g_state.model_size : 0);
}

EMSCRIPTEN_KEEPALIVE
void colibri_reset() {
    if (g_state.model_data) {
        free(g_state.model_data);
        g_state.model_data = NULL;
    }
    g_state.model_loaded = 0;
}
