# ADR-0008: SSH Commit Signing + Remote Auth Plan

## Status

Accepted 2026-09-07. Pending: public-key upload to GitHub by the operator
before the remote URL can be switched.

## Context

After the GitHub PAT exposure (Sec1, commit `606222e` — wait, that was the
gitignore commit; Sec1 was an uncommitted local change), the repository is
authenticated to `github.com` via:

- HTTPS remotes (`https://github.com/koraussie7/MuhanAI.git`) on both
  `origin` and `muhanai`.
- `gh auth` providing a PAT (now deprecated; the token was issued under
  the user account `koraussie7`) which macOS Keychain caches.

For local dev this works, but for **future commits** the lack of signing
means anyone with write access to the local checkout can produce commits
that look like they came from the account holder. There is no
cryptographic binding between commits and the operator.

Separately, the four pre-existing ed25519 SSH keys on this machine
(`id_ed25519`, `id_ed25519_225`, `id_ed25519_mac`, `id_ed25519_macbook`)
were tested against `git@github.com` and none of them authenticate:

```
$ for k in id_ed25519 id_ed25519_225 id_ed25519_mac id_ed25519_macbook; do
    ssh -T -o IdentitiesOnly=yes -i ~/.ssh/$k git@github.com
  done
git@github.com: Permission denied (publickey).   # ×4
```

`gh ssh-key list` returned HTTP 403 because the active PAT lacks the
`admin:public_key` scope, so we cannot enumerate which keys (if any) are
on the account via the API either. The visible state is: no usable SSH key
is currently registered for `koraussie7` on GitHub.

## Decision

Generate a **dedicated** ed25519 key (`agentmesh_ed25519`) for both
authentication and commit signing in this repository. Wire it through
SSH config + git config so:

1. Every commit created in this repo from this point forward is signed.
2. Every `fetch` / `push` from this repo's working tree uses this key —
   not the leaked PAT.
3. Verification of past and future signatures works locally without an
   external trust store round-trip.

### Key generation

```bash
ssh-keygen -t ed25519 \
  -C "koraussie@gmail.com — MuhanAI/agentmesh commit signing + GitHub auth (2026-09-07)" \
  -f ~/.ssh/agentmesh_ed25519 \
  -N ""
```

Result:

- **Fingerprint**: `SHA256:zZ07FPy2BUquGbyXEKP+evff1yV7gAPC9UeSxAIHGbg`
- **Public key body**: `AAAAC3NzaC1lZDI1NTE5AAAAIN8G/gXdwzgPsl4YZp1I2xSXzFlhNxojcGsmmcId8W6x`

The key has **no passphrase** to enable non-interactive CI usage. This is
an explicit trade-off documented in §Consequences.

### SSH config (~/.ssh/config)

A new Host alias `github.com-agentmesh` is added so the key only matches
when explicitly requested:

```
Host github.com-agentmesh
  HostName github.com
  User git
  IdentityFile ~/.ssh/agentmesh_ed25519
  IdentitiesOnly yes
  AddKeysToAgent yes
  UseKeychain yes
```

`IdentitiesOnly yes` prevents the agent from offering any other key —
so this alias cannot accidentally fall through to one of the unused
keys. `UseKeychain yes` (macOS-specific) wraps the key in the login
keychain so successive SSH sessions do not need the (empty) passphrase.

### Git config (repo-local only)

```
gpg.format                     = ssh
user.signingkey                = ~/.ssh/agentmesh_ed25519.pub
commit.gpgsign                 = true
tag.gpgsign                    = true
gpg.ssh.allowedSignersFile     = ~/.ssh/agentmesh_allowed_signers
```

All five values are set with `git config --local` so they apply only to
this repo and do not leak to other projects on this machine.

### Allowed signers file

git requires an explicit allow-list to **verify** an SSH signature; the
allow-list is a flat file with one line per signer:

```
<principal> <key-type> <base64-pubkey>
```

We list two principals so commits authored with either address verify:

```
koraussie@gmail.com                  ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIN8G/gXdwzgPsl4YZp1I2xSXzFlhNxojcGsmmcId8W6x
koraussie7@users.noreply.github.com  ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIN8G/gXdwzgPsl4YZp1I2xSXzFlhNxojcGsmmcId8W6x
```

### Operator action required

To complete the wiring, the operator must upload the public key
(`~/.ssh/agentmesh_ed25519.pub`) to
**https://github.com/settings/keys** as an **Authentication key**.

Once the upload is confirmed, the operator signals "key uploaded" and
these follow-up steps execute automatically:

1. `git remote set-url origin git@github.com-agentmesh:koraussie7/MuhanAI.git`
   (same for `muhanai`).
2. `ssh -T git@github.com-agentmesh` smoke-test — expect:
   `Hi koraussie7! You've successfully authenticated…`
3. `git fetch origin --dry-run` and `git push origin --dry-run main` to
   confirm the round-trip before committing to a real push.

### Why a dedicated key (not reuse)

- **Blast-radius isolation.** A key used only for MuhanAI on this one
  machine has a smaller attack surface than `id_ed25519_macbook` (which
  the operator may reuse across machines and services).
- **Revocability.** If this key is ever compromised, revoking it touches
  exactly one workflow, not every server / GitHub org / backup target the
  primary key reaches.
- **Naming.** The comment `MuhanAI/agentmesh commit signing + GitHub auth`
  means a `git log --show-signature` trace tells the operator exactly
  which capability the key holds without scanning metadata.

## Consequences

**Positive**

- Every new commit carries an `-----BEGIN SSH SIGNATURE-----` block tied
  to the operator's private key. Tampering with history breaks the chain
  and is visible locally and on GitHub.
- The repository no longer depends on the leaked PAT for any operation.
- The signing key is reproducible from a single command and the
  fingerprint is documented; re-derivation is a one-liner.

**Negative**

- **Empty passphrase** means a disk-level read of `~/.ssh/agentmesh_ed25519`
  (e.g. by a process-level attacker with file-read access) immediately
  yields the signing key. macOS Keychain wrapping (`UseKeychain yes`)
  mitigates this for some access patterns but not all. Adding a
  passphrase is a follow-up — the trade-off was made for CI usability.
- **No SSH key is currently on GitHub.** Until the operator uploads the
  public key, `git fetch` / `git push` will fail when retargeted to SSH.
  The remote URL is therefore **not** changed by this ADR; that switch
  is the operator's confirmation step.
- **Past commits** (from before signing was configured) are unsigned.
  Going forward is the only thing we can do — the past cannot be
  retroactively signed without rewriting history, which would break
  anyone tracking the branch.

**Operational**

- The signing fingerprint
  `SHA256:zZ07FPy2BUquGbyXEKP+evff1yV7gAPC9UeSxAIHGbg` is the canonical
  identity for this repository from 2026-09-07 onward.
- A keypair rotation follows the same procedure as a peer-identity
  rotation (ADR-0007), but at the git transport layer: new keypair,
  re-upload public key to GitHub, update `user.signingkey`, re-sign
  future commits.
