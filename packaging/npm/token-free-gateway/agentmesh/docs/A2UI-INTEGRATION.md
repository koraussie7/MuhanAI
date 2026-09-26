# MuhanAI A2UI integration

MuhanAI now exposes a small A2UI v1-compatible runtime around the existing shop surface builder.
The implementation deliberately keeps the protocol boundary separate from React rendering:
Agents emit JSONL operations, the API validates/folds them, and each client renders only its
trusted catalog components.

## API

`POST /api/a2ui/validate` validates an array of A2UI operations:

```json
{
  "messages": [
    {
      "version": "v1.0",
      "createSurface": { "surfaceId": "shop1-menu", "catalogId": "basic" }
    }
  ]
}
```

`POST /api/a2ui/fold` parses JSONL or folds an operation array into a surface state and validates
its component tree:

```json
{ "jsonl": "{\"version\":\"v1.0\",...}" }
```

Both routes use the normal API-key protection. They do not execute component code or actions.

## Runtime boundary

- `packages/mcp/src/a2ui-surface.ts` generates the shop surface.
- `packages/mcp/src/a2ui-runtime.ts` parses, validates, folds, and checks cycles/missing children.
- `services/api/src/a2ui-routes.ts` exposes validation/folding for Web, Ghost, and future clients.
- A client-side trusted catalog remains responsible for actual rendering and action approval.

The runtime is intentionally compatible with the current MuhanAI `v1.0` shop payload while the
upstream A2UI project is in public preview. A future version can replace the validator with the
upstream conformance schema without changing the API boundary.
