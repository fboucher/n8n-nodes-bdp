# n8n-nodes-bdp

Community-maintained n8n nodes for read-only access to Schneider Electric EcoStruxure Building Data Platform (BDP). This independent community package is not an official Schneider Electric product.

The node uses the BDP REST API v3.0 with a fixed UAT or production host. It exposes four read-only operations and does not provide generic HTTP requests, writes, commands, GraphQL, enrichment, cursors, or exactly-once guarantees.

## Installation

Install `n8n-nodes-bdp` from **Settings → Community nodes** in a self-hosted n8n instance, or follow [n8n's community-node installation guide](https://docs.n8n.io/integrations/community-nodes/installation/). The npm package name is a proposed identity; maintainers must approve the package owner and publishing configuration before the first release.

## Requirements and development

- Node.js 22 or later, matching the current n8n community-node runtime requirement.
- n8n 1.x with community nodes enabled. Validate the exact n8n release used by your deployment before production use.
- TypeScript and the `@n8n/node-cli` supplied by this repository.

Install dependencies and run the local hot-reload development loop:

```sh
npm install
npm run dev
```

Run the automated checks:

```sh
npm test
npm run lint
```

`npm test` builds the node and runs the credential, operation, transport, and timestamp tests. No BDP credentials or live API access are needed for these checks.

## Credentials

Create one **BDP Community OAuth2 API** credential and enter the tenant ID, client ID, client secret, and application scope provided by your BDP administrator. Select UAT or Production explicitly. n8n's OAuth2 client-credentials support obtains and refreshes access tokens; do not paste bearer tokens into workflow parameters.

The credential test sends a read-only request to list at most one building. An empty successful response is a valid credential with no accessible buildings; authentication failures and access-denied responses are surfaced separately. The API contract declares bearer authentication and does not require the optional subscription-key scheme. Confirm environment-specific access with your BDP administrator.

After updating this package, restart n8n to reload the compiled credential definition. Existing credentials do not need to be recreated or resaved for the token-URL expression fix: n8n applies the current hidden default when resolving credentials. If using a read-only `dist` mount with `N8N_CUSTOM_EXTENSIONS`, run `npm run build` in the mounted source checkout, then restart the n8n service when it is safe to interrupt executions. Rebuilding alone does not reload definitions already loaded by the running process.

## Operations

| Resource | Operation | Behavior |
| --- | --- | --- |
| Building | List | Lists all accessible native building records by default, following pagination; optional server-side name filter and optional Limit. |
| Building | Get | Retrieves the full native record for one selected or manually entered building ID. |
| Measurement Point | List | Lists points in a selected building; optional name, ontology-type, and unit filters. |
| Measurement Point | Historical Values | Reads history from the dedicated measurement-point endpoint. |
| Building | Historical Values | Reads building-wide history directly without enumerating points. |

Building List defaults to **Return All**, so it follows pagination to list all accessible buildings. Turn Return All off to apply its optional Limit (default 100). Other list and historical operations retain their 100-record Limit default with an explicit **Return All** option. Each API page requests no more than 5,000 records. Results preserve the API's native fields and value types and are returned as individually linked n8n items; empty results produce zero items.

Historical Start and End fields require ISO 8601 timestamps with seconds and an explicit `Z` or UTC offset, for example `2025-01-01T00:00:00Z` or `2025-01-01T01:00:00+01:00`. The node normalizes valid offsets to UTC and rejects ambiguous local timestamps and windows where Start is not earlier than End. BDP determines whether the time boundaries are inclusive.

The node uses ascending timestamp order and preserves filters and time windows across pages. It retries eligible transient failures a bounded number of times, honors a usable `Retry-After`, and fails the operation if a later page fails. Offset pagination over a changing dataset may still produce gaps or duplicates; scheduling, overlap, and deduplication are workflow responsibilities.

## Example

The workflow below illustrates the minimal building-list shape. Bind your own BDP credential and select the required credential environment:

```json
{
  "resource": "building",
  "operation": "getAll",
  "returnAllBuildings": true
}
```

Use the Building **Get** operation when you need the full details for one building ID; **List** calls the collection endpoint and returns each accessible building separately.

Importable sanitized workflow examples for scheduled point history and direct building history are in [`examples/`](examples/).

## Troubleshooting

- **Authentication failed:** verify the tenant ID, client ID, client secret, and application scope with your BDP administrator.
- **Access denied:** verify that the application has permission to access the selected environment and requested building.
- **No results:** an empty list is valid; check the building selection, filters, access scope, and time window.
- **Selector search fails:** choose a resolved building before searching measurement points, or enter an ID manually. Unresolved expressions are not used to issue unrelated searches.

## Support and scope

This package is independently maintained. Open implementation issues in [the repository](https://github.com/fboucher/n8n-nodes-bdp/issues); BDP access, tenant configuration, and API permissions remain the responsibility of your administrator.

UAT workflow validation, a clean Docker installation, and publishing require maintainer-provided UAT access and approved npm/GitHub publishing configuration. These deployment checks are not implied by the mocked automated tests.

## License

[MIT](LICENSE.md)
