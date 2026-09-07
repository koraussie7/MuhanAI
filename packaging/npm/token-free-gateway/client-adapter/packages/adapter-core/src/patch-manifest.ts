/**
 * Patch manifest — the contract between adapter-core and the patch-package
 * patches directory. Lists every file we mutate in the upstream Happy build.
 *
 * Adding a file here REQUIRES adding the corresponding .patch file in
 * /patches/ AND bumping HAPPY_PATCH_VERSION. CI verifies all three stay in
 * sync; a drift breaks the build.
 */

import { HAPPY_PINNED_VERSION } from "./endpoints.js";

export const HAPPY_PATCH_VERSION = 1 as const;

export interface PatchEntry {
  /** Path inside Happy repo (forward-slash, relative to happy root). */
  target: string;
  /** Path of the .patch file in /patches/. */
  patchFile: string;
  /** One-line description for the changelog. */
  description: string;
}

export const PATCHES: readonly PatchEntry[] = [
  {
    target: "packages/happy-app/app.config.js",
    patchFile: "patches/app.config.js.patch",
    description: "Bundle id + serverUrl + branding constants injected into Expo config",
  },
] as const;

/**
 * Asserts that the manifest is internally consistent. Called from CI
 * before patch-package applies patches.
 */
export function assertManifestValid(): void {
  if (HAPPY_PATCH_VERSION < 1) {
    throw new Error("HAPPY_PATCH_VERSION must be >= 1");
  }
  if (PATCHES.length === 0) {
    throw new Error("PATCHES must not be empty");
  }
  for (const p of PATCHES) {
    if (!p.patchFile.endsWith(".patch")) {
      throw new Error(`Patch file must end with .patch: ${p.patchFile}`);
    }
  }
}

export const ADAPTER_METADATA = {
  happyVersion: HAPPY_PINNED_VERSION,
  patchVersion: HAPPY_PATCH_VERSION,
  patchCount: PATCHES.length,
} as const;
