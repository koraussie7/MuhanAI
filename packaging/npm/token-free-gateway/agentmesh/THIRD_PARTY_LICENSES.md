# Third-Party Licenses

This project includes code and patterns derived from upstream open-source projects.
Below is the attribution required by each license.

## ed25519 / crypto utilities

- **Source**: upstream ed25519 implementations
- **License**: MIT, BSD, or CC0 depending on upstream variant
- **Files**: `packages/federation-transport/types/crypto/ed25519.js`
- **Notes**: Used for key generation and signature verification in P2P identity flows.

## folklore protocol patterns

- **Source**: folklore protocol patterns
- **License**: MIT / permissive open source
- **Files**: `packages/federation-transport/types/protocols/folklore.js`
- **Notes**: Protocol-level message framing patterns; behavior reimplemented, not verbatim copied.

## p2pclaw DID pattern

- **Source**: p2pclaw DID pattern
- **License**: MIT / Apache-2.0 or equivalent permissive license
- **Files**: `packages/p2p/src/identity.ts`
- **Notes**: Decentralized identifier structure and verification flow; implementation adapted for MuhanAI agent identity.
