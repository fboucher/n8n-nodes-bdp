# Development

## Requirements

- Node.js 22 or later, matching the current n8n community-node runtime requirement.
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
