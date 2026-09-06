/**
 * @deprecated This path is a re-export shim for backward compatibility.
 * The file was renamed to `ecdsa-p256.ts` because the implementation uses
 * ECDSA P-256 (not Ed25519). Please update your imports:
 *
 *   `import { sign } from "./crypto/ed25519.js"`
 *       ↓
 *   `import { sign } from "./crypto/ecdsa-p256.js"`
 *
 * External package consumers are unaffected — they import from
 * `@agentmesh/federation-transport`, which continues to expose the
 * same export names.
 *
 * This shim will be removed in the next major release.
 */
export {
  generateKeyPair,
  sign,
  verify,
  computeFingerprint,
  type KeyPair,
} from "./ecdsa-p256.js";
