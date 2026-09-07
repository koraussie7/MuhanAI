# ADR-0007: Peer Identity Rotation Protocol

## Status

Accepted 2026-09-07.

## Context

The libp2p peer identity is the root of trust for every node in the
`@agentmesh/p2p` overlay. It is derived from a single ed25519 keypair stored
on disk at `./.agentmesh/identity.json` (relative to the process CWD) and
loaded by:

- `packages/federation-transport/src/libp2p-transport.ts:38`
- `services/api/src/server.ts:48`

Both default to the same path; both call `loadOrCreateIdentity(path)` from
`packages/p2p/src/identity.ts:43`, which is canonical for the workspace.

On 2026-09-07 a security audit discovered that this file had been written
to the working tree with `mode 0o600` but its contents were not encrypted at
rest. The 32-byte seed half of the key was recoverable by any process with
read access to the workspace:

| field            | value (redacted)                                            |
| ---------------- | ----------------------------------------------------------- |
| format           | `ed25519-raw-v1`                                            |
| peerId           | `12D3KooWSjSipkmtJTSAYcJWTE6YZxV9ni3UAhyRBjKqrxo1te5K`       |
| privateKeyB64    | *(redacted; SHA-256: `287635fd…f472c596c7`)*                |
| createdAt        | `2026-09-07T07:47:00.872Z`                                  |

The peerId is the SHA-256 of the **public** key, so knowing the peerId alone
does not compromise the key — but reading the file yields the private key
directly. With the private key, an attacker can:

1. Impersonate this node to other peers (sign messages, authenticate
   pubsub, accept delegated routes).
2. Decrypt any session traffic routed through this node.
3. Sustain the impersonation indefinitely — there is no expiry, no
   revocation, and no rotation cadence in the current design.

The exposure was scoped to the local filesystem plus any backup/sync targets
(Time Machine, iCloud, Dropbox, `~/backup/`, etc.) that may have already
ingested the file. The remote origin (`origin/main`) was **never pushed to**
during the affected period, so the key did not leak via git history — but
the local-only commit + working tree was a real exposure window.

The GitHub PAT issue (Sec1 in commit `606222e`) was an independent incident
in the same audit, addressed separately.

## Decision

We formalize a rotation protocol with three properties: (1) determinism on
read, (2) one-shot generation on missing file, (3) explicit operator
procedure for key compromise.

### 1. Loader contract (already in place, now explicit)

`loadOrCreateIdentity(path)` is the canonical entry point. It guarantees:

- If `path` exists and parses as `ed25519-raw-v1` with a 64-byte payload →
  return the existing identity. **No regeneration.** This is the
  "determinism on read" property the federation needs.
- If `path` is missing → generate a fresh ed25519 keypair via
  `@noble/curves/ed25519`, write to `path` with `mode 0o600`, return.
- If `path` is corrupt (unparseable JSON, wrong length) → sidecar a backup
  to `<path>.corrupt.<timestamp>` and generate fresh.

### 2. Format invariant

`IDENTITY_FORMAT_CURRENT = "ed25519-raw-v1"`. Any future migration MUST
add a new constant (`ed25519-raw-v2`) and translate on read; existing files
MUST NOT be overwritten in place.

### 3. Operator rotation procedure

When the operator (or this ADR's auditor) suspects the private key has been
read by an unauthorized party:

```bash
# (a) Snapshot the OLD identity for audit (NEVER echo the private key)
cat .agentmesh/identity.json | jq -r '
  "OLD_PEER_ID        = " + .peerId + "\n" +
  "OLD_CREATED        = " + .createdAt + "\n" +
  "OLD_PRIVKEY_SHA256 = " + (.privateKeyB64 | @base64d | @sha256)
'
# (b) Delete the file. The loader will regenerate on next start.
rm .agentmesh/identity.json
# (c) Re-run the loader (or start the service) to mint a fresh key.
AGENTMESH_INCIDENT_ROTATE=1 pnpm test tests/incident-rotate.test.ts
# (d) Diff the OLD vs NEW peerId. Different = rotated.
# (e) Update any external registries (DHT bootstrap, ACL lists, allowlists).
```

Step (a) is deliberately a SHA-256 fingerprint, not the raw key, so the
audit log itself does not become a leak vector.

### 4. CI / test coverage

A new unit test in `packages/p2p/src/tests/identity.test.ts` ("rotates
peerId when the file is deleted") asserts the rotation contract: delete →
reload → `peerId_after ≠ peerId_before`.

A new workspace-level operational test
`tests/incident-rotate.test.ts` (gated behind
`AGENTMESH_INCIDENT_ROTATE=1`) targets the real `./.agentmesh/identity.json`
so the same procedure can be invoked from CI as a smoke test, but never runs
on plain `pnpm test`.

`vitest.config.ts` is updated to include the workspace `tests/` directory
without affecting other test discovery.

### 5. What this ADR does **not** solve

- **At-rest encryption** of the file (e.g. macOS Keychain-backed
  `@noble/curves/ed25519` key material via `security add-generic-password`).
  This is a separate hardening concern; tracked as a follow-up.
- **Time-bound identity** (e.g. self-expiring keys after N days). Rotation
  cadence is operator-driven.
- **Server-side reputation / repudiation** for the leaked OLD peerId. Any
  external system that trusted `12D3KooWSjS…te5K` should treat it as
  untrusted indefinitely and re-bootstrap against the new peerId out of band.

## Consequences

**Positive**

- The rotation contract is now testable and exercised by CI when explicitly
  requested.
- The audit trail (SHA-256 of old key + OLD peerId) lets us prove rotation
  happened without re-leaking the key.
- The incident-rotate test can be re-run any time the operator wants to
  prove the loader is healthy.

**Negative**

- macOS Keychain / encrypted keychain support is **not** added in this
  rotation. The new key is still at-rest plaintext (mode 0600). A determined
  attacker with file-read access can still recover the new key — the
  rotation only invalidates the *old* key.
- External systems that pinned the OLD peerId (e.g. libp2p bootstrap lists
  cached in remote peers) will see this node as a new identity. Out-of-band
  re-registration is the operator's responsibility.

**Operational**

- After this rotation, the active peerId for the workspace is
  `12D3KooWR6c36nTs7SQdTXYpe3TxuvdjaJJBQFKAdQ6t8wCAzXSy`.
- The OLD peerId (`12D3KooWSjS…te5K`) **must not** be referenced in any
  further code, config, or commit.
