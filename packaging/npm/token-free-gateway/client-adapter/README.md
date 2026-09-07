# client-adapter

MuhanAI client adapter monorepo — thin patches over official Happy builds, **NO fork**.

## Why a separate monorepo

Happy ships with a React Native + Tauri + Expo toolchain. Mixing that
into the agentmesh pnpm workspace (TypeScript + Prisma + libp2p + wrangler)
creates toolchain conflicts that are not worth the integration cost. We
keep adapter source separate and ship it as a downloadable installer.

See `../agentmesh/docs/HAPPY-INTEGRATION-ANALYSIS.md` for full rationale.

## Layout

```
client-adapter/
  packages/
    adapter-core/          # TypeScript: endpoint constants + patch manifest
      src/
        endpoints.ts       # MuhanAI URLs, bundle id, Happy pinned version
        patch-manifest.ts  # contract for /patches/*.patch files
        index.ts
        tests/
      patches/             # patch-package .patch files (target: happy source)
```

## Install (when user runs `curl get.muhanai.com/client.sh`)

```
1. Download official Happy build for current OS
2. Verify SHA-256 of the archive
3. Apply patches/* via patch-package
4. Re-sign (macOS) / re-package (Windows/Linux)
5. Launch as MuhanAI-branded app
```

Adapter surface is ~400 LOC; happy-app is ~80,000 LOC. We own 0.5%.
