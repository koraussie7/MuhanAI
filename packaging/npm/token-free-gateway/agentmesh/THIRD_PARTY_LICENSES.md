# Third-Party Licenses

This project includes code and patterns derived from upstream open-source projects.
Below is the attribution required by each license.

## Ed25519 / ECDSA crypto utilities

- **Source**: `@noble/curves` (ed25519), `@libp2p/crypto` (P-256 ECDSA)
- **License**: MIT
- **Files**: `packages/p2p/src/identity.ts`, `packages/federation-transport/src/crypto/ecdsa-p256.ts`
- **Notes**: Identity loading and signing patterns adapted from folklore's `loadOrCreateIdentity`. The crypto primitives themselves come from `@noble/curves` (MIT) and `@libp2p/crypto` (MIT).

## Folklore protocol patterns

- **Source**: [folklore](https://github.com/usefolklore/folklore) — `packages/federation-transport/src/protocols/folklore.ts`
- **License**: MIT
- **Files**: `packages/federation-transport/src/protocols/folklore.ts` (SignedRecord, QueryMessage)
- **Notes**: Protocol-level message framing and signed record structure; behavior reimplemented, not verbatim copied. Pattern attribution noted in source file headers.

## p2pclaw DID pattern

- **Source**: p2pclaw DID format `did:p2pclaw:<bs58(ed25519)>`
- **License**: Pattern reference only — no code copied. The `did:` prefix convention is a W3C standard (CC0/W3C Document License).
- **Files**: `packages/p2p/src/identity.ts` (IDENTITY_FORMAT_CURRENT = "ed25519-raw-v1")
- **Notes**: The DID format string and multi-format encoding follow p2pclaw's convention but are implemented from scratch using `@libp2p` primitives.
