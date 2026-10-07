// Test script to verify Colibri WASM module loads in Node.js
// Run with: node test-wasm.js

import createColibriModule from "./public/colibri/colibri.js";

async function testWASM() {
  console.log("Testing Colibri WASM module...");

  try {
    const module = await createColibriModule({
      locateFile: (path) => {
        if (path.endsWith(".wasm")) return "./public/colibri/colibri.wasm";
        if (path.endsWith(".data")) return "./public/colibri/colibri.data";
        return path;
      },
    });

    console.log("✅ Module loaded");
    console.log("Exported functions:", Object.keys(module).filter(k => typeof module[k] === 'function'));

    // Test init — pass C string pointer (colibri_init takes const char*)
    const modelName = "GLM-5.2";
    const modelNamePtr = module._malloc(modelName.length + 1);
    module.stringToUTF8(modelName, modelNamePtr, modelName.length + 1);
    const initResult = module._colibri_init(modelNamePtr);
    module._free(modelNamePtr);
    console.log("Init result:", initResult);

    // Test generate — colibri_generate(prompt_ptr, max_tokens, temperature, top_p, top_k, seed)
    const prompt = "Hello, world!";
    const maxTokens = 10;
    const temperature = 0.7;
    const topP = 0.9;
    const topK = 40;
    const seed = 42;

    const promptPtr = module._malloc(prompt.length + 1);
    module.stringToUTF8(prompt, promptPtr, prompt.length + 1);

    const resultPtr = module._colibri_generate(
      promptPtr,
      maxTokens,
      temperature,
      topP,
      topK,
      seed
    );

    module._free(promptPtr);

    const result = module.UTF8ToString(resultPtr);
    console.log("Generation result:", result);

    // Free result string
    module._free(resultPtr);

    // Test tokenize — colibri_tokenize(text_ptr, tokens_ptr, max_tokens)
    const text = "test tokenization";
    const textPtr = module._malloc(text.length + 1);
    module.stringToUTF8(text, textPtr, text.length + 1);

    const tokens = new Int32Array(100);
    const tokensPtr = module._malloc(tokens.length * 4);

    const tokenCount = module._colibri_tokenize(
      textPtr,
      tokensPtr,
      100
    );

    module._free(textPtr);
    module._free(tokensPtr);
    console.log("Token count:", tokenCount);

    // Free
    module._colibri_free();
    console.log("✅ All tests passed!");

  } catch (err) {
    console.error("❌ Test failed:", err);
    process.exit(1);
  }
}

testWASM();
