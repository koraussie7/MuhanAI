/**
 * Computer Use Module for MuhanAI
 * 
 * Provides AI-powered computer control capabilities:
 * - Screen capture and analysis
 * - Mouse and keyboard control
 * - Browser automation
 * - Vision-based UI interaction
 * 
 * Integrates with:
 * - E2B Desktop Sandbox (cloud sandbox)
 * - BYOK Vision Providers (OpenAI, Google, Groq, OpenRouter)
 * - MoltMesh P2P (distributed task execution)
 * - memwal (memory persistence)
 */

export { E2bBrowserAdapter, type E2bBrowserAdapterOptions } from './e2b-adapter.js';
export { E2bStreamSession, runComputerUseLoop, type ComputerUseAction, type ComputerUseStep, type ComputerUseLoopOptions, type ComputerUseLoopResult } from './e2b-computer-use.js';
export { buildComputerUseRunHandler, COMPUTER_USE_RUN_CAPABILITY, type ComputerUseRunArgs } from './computer-use-router.js';
export { createByokVisionProvider, type ByokProviderId, type ByokVisionProvider, type CreateByokVisionProviderOptions } from './e2b-byok-vision.js';

// Re-export types
export type { E2bSandboxLike, VisionClient } from './e2b-adapter.js';
