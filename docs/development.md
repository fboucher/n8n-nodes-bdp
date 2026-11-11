# Development

## Requirements

- Node.js 22 or later, matching the current n8n community-node runtime requirement.
- Self-hosted n8n with community nodes enabled. Packaging is checked against n8n **2.44.4**; older 1.x releases are not certified. Validate the exact n8n release used by your deployment before production use.
- TypeScript and the `@n8n/node-cli` supplied by this repository.

To run a local n8n instance with this node loaded, see [Docker Compose](docker-compose.md).

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
