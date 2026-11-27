# Development

## Requirements

- Node.js 24 or later to install dependencies and run development, build, lint, test, and release commands. The CLI's `isolated-vm` dependency requires Node.js 24 or later.
- The built community node's runtime requirement remains Node.js 22 or later, matching the current n8n community-node runtime requirement.
- Self-hosted n8n with community nodes enabled. Packaging is checked against n8n **2.44.4**; older 1.x releases are not certified. Validate the exact n8n release used by your deployment before production use.
- TypeScript and the `@n8n/node-cli` supplied by this repository.

TypeScript is pinned to 5.9.3 because the n8n CLI's TypeScript ESLint stack does not
support TypeScript 7's native compiler API. This also preserves the existing
CommonJS/Node module resolution configuration. ESLint is pinned to 9.29.0 to match
the CLI's bundled version and keep lint plugin dependencies resolvable on clean
installs. Dependabot skips TypeScript and ESLint major updates until the CLI's lint
tooling and compiler configuration can migrate together.

To run a local n8n instance with this node loaded, see [Docker Compose](docker-compose.md).

## Node structure

Resource-specific properties, execution, and list searches live under `nodes/Bdp/resources/`.
Shared historical and pagination parameters remain in `nodes/Bdp/shared/` to preserve their
existing visibility and defaults. Use `fetchScopedList` for documented parent-child list
routes: supply an explicit scope-to-path mapping, parent ID, child segment, filters, ordering,
and pagination options. It delegates requests and pagination to the shared transport.

Use `createResourceLocator` and `createListSearch` for new selectors. Scoped searches must
declare their parent parameter and path; a missing or unresolved parent is rejected rather
than searching a different collection. Register each search method on the node when exposing
a new selector. These helpers do not themselves expose new operations.

## Dev loop

```sh
npm install
npm run dev
```

## Checks

```sh
npm test
npm run lint
npm run test:docker
```

`npm test` builds the node and runs the credential, operation, GraphQL, example, transport, and timestamp tests. No Building Data Platform (BDP) credentials or live API access are needed.

`npm run test:docker` additionally requires Docker and npm registry access. It installs the package archive in a disposable `n8nio/n8n:2.44.4` container, checks discovery and workflow imports, and cleans up its container and temporary archive.

## Packaging and release

The package archive contains compiled node/credential code, theme assets, public documentation, and synthetic workflows; npm installs the GraphQL parser alongside it. Private `.local/` documentation, schemas, credentials, development inputs, and customer data are excluded from both Git and the archive.

Self-hosted lint configuration intentionally disables Cloud-only dependency restrictions, not parser validation or TypeScript strictness.

Publication goes through `npm run release` and the tag-triggered GitHub Actions workflow after maintainer approval. The npm package name is a proposed identity; maintainers must approve the package owner and publishing configuration before the first release.

## Write operations

Phase four adds REST writes. They are deliberately fenced off from the read paths:

- `requestBdp` is GET-only. Writes go through `requestBdpWrite` in `nodes/Bdp/shared/transport.ts`, which refuses any request that is not on the write allowlist, rejects paths outside `/api/`, and uses the same credential, base URL, `X-Api-Version: 3.0` header and safe error mapping as reads.
- `nodes/Bdp/shared/writeAllowlist.ts` is the only place that grants write permission. Each entry names the resource, operation, HTTP method and exact path pattern, and whether repeating the request is harmless (`idempotent`).
- `nodes/Bdp/shared/write.ts` holds the pure helpers: `buildReplacePatch` (JSON Patch limited to `replace`, with caller-supplied allowed paths and value validators), `requireUuid`, and `normalizeWriteResponse`.
- The GraphQL resource keeps its own query-only entry point and is not affected.

### Registering a new write operation

1. Add an entry to `WRITE_ALLOWLIST` in `shared/writeAllowlist.ts`, using the narrowest path pattern. Only mark it `idempotent` for PATCH `replace`.
2. Validate all input before calling `requestBdpWrite` (build patches with `buildReplacePatch`, check UUIDs and numbers). Validation must not need credentials or the network.
3. Call `requestBdpWrite.call(context, { resource, operation, method, path, body, jsonPatch })`. Encode every path segment with `encodeURIComponent`.
4. Handle the normalized result: `noContent` (204 or empty), `success` (body), or `partial` (206 with `items` and `itemErrors`). Never report a `partial` result as full success.
5. Add the operation to `EXPECTED_WRITES` in `tests/write-allowlist.test.cjs`. That test enumerates every node operation and fails if anything unlisted sends a non-GET request, or if a read operation does.
6. Update `docs/operations.md` and the README.

### Retries

Writes are **not retried** by default. A call may pass `retry: true`, and it is honoured only when the allowlist entry is `idempotent`. That is safe for PATCH `replace` (repeating it sets the same value) and never for POST create, on-demand set/run, or telemetry, where a retry after an ambiguous failure could repeat a physical action or duplicate data.

### Errors

Write failures use `safeWriteFailureMessage`: a message derived from the HTTP status only. Credentials, tokens and request bodies are never included in errors.
