# n8n-nodes-bdp

Community-maintained n8n nodes for read-only access to Schneider Electric EcoStruxure Building Data Platform (BDP). This independent community package is not an official Schneider Electric product.

The node uses BDP REST API v3.0 and read-only GraphQL queries with a fixed UAT or production host. Existing REST operations and credentials are unchanged. It does not provide generic HTTP requests, writes, commands, subscriptions, enrichment, cursors, or exactly-once guarantees.

This package targets **self-hosted n8n**. The declared GraphQL parser runtime dependency means it does **not** claim current n8n Cloud verification eligibility or Cloud support.

## Installation

Install `n8n-nodes-bdp` from **Settings → Community nodes** in a self-hosted n8n instance, or follow [n8n's community-node installation guide](https://docs.n8n.io/integrations/community-nodes/installation/). The npm package name is a proposed identity; maintainers must approve the package owner and publishing configuration before the first release.

## Run locally with Docker Compose

The included [`compose.yml`](compose.yml) runs a standalone n8n instance with this checkout's BDP node loaded. See the [local Docker Compose guide](docs/docker-compose.md) for setup, workflow examples, daily use, and troubleshooting. This is a local testing setup, not a production deployment.

## Requirements and development

- Node.js 22 or later, matching the current n8n community-node runtime requirement.
- Self-hosted n8n with community nodes enabled. Phase two packaging is checked against n8n **2.44.4**; older 1.x releases are not newly certified by these checks. Validate the exact n8n release used by your deployment before production use.
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
npm run test:docker
```

`npm test` builds the node and runs the credential, operation, GraphQL, example, transport, and timestamp tests. No BDP credentials or live API access are needed for these checks. `npm run test:docker` additionally requires Docker and npm registry access, installs an archive in a disposable `n8nio/n8n:2.44.4` container, checks real discovery/imports, and cleans up its container and temporary archive.

## Credentials

Create one **BDP Community OAuth2 API** credential and enter the tenant ID, client ID, client secret, and application scope provided by your BDP administrator. Select UAT or Production explicitly. n8n's OAuth2 client-credentials support obtains and refreshes access tokens; do not paste bearer tokens into workflow parameters.

The credential test sends a read-only request to list at most one building. An empty successful response is a valid credential with no accessible buildings; authentication failures and access-denied responses are surfaced separately. The API contract declares bearer authentication and does not require the optional subscription-key scheme. Confirm environment-specific access with your BDP administrator.

After updating this package, restart n8n to reload the compiled credential definition. Existing credentials do not need to be recreated or resaved for the token-URL expression fix: n8n applies the current hidden default when resolving credentials.

For Docker development, use the [included Compose setup](docs/docker-compose.md), which mounts both the compiled node and its declared GraphQL parser dependency. If adapting an existing Compose setup, preserve existing `NODE_PATH` entries using the container's `:` separator and recreate the container after changing mounts.

## Operations

| Resource | Operation | Behavior |
| --- | --- | --- |
| Building | List | Lists all accessible native building records by default, following pagination; optional server-side name filter and optional Limit. |
| Building | Get | Retrieves the full native record for one selected or manually entered building ID. |
| Measurement Point | List | Lists points in a selected building; optional name, ontology-type, and unit filters. |
| Measurement Point | Historical Values | Reads history from the dedicated measurement-point endpoint. |
| Building | Historical Values | Reads building-wide history directly without enumerating points. |
| GraphQL | Execute Query | Executes one read-only query per input and returns one complete response envelope. |

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

## GraphQL Execute Query

Select **GraphQL → Execute Query** in the existing Building Data Platform node and bind the same **BDP Community OAuth2 API** credential. Its environment selects the fixed `/graphql` endpoint on the corresponding REST host. Requests use authenticated JSON POST with `Accept: application/json` and `Content-Type: application/json`; the REST-only `X-Api-Version: 3.0` header is not sent. The supplied API reference documents these endpoints and shared OAuth authentication, not an additional GraphQL version header. Confirm access in your environment: a successful REST credential test alone does not establish GraphQL permission.

Author against the **existing BDP GraphQL explorer** supplied by your administrator. Confirm field names, relationships, scalar types, filters, permissions, and server limits there. The node does not introspect, cache, or ship a schema. The examples below are independently authored synthetic templates, not live UAT evidence.

- **Query:** required multiline document, resolved separately for each input item. Standard anonymous/named queries, aliases, fragments, directives, comments, and variable definitions are supported.
- **Variables:** JSON object, default `{}`, or an n8n expression returning an object, such as `={{ { take: $json.take, skip: $json.skip } }}`. Arrays, scalars, `null`, invalid JSON, and non-JSON values at the top level fail locally. Nested JSON values retain their types.
- **Operation Name:** optional for a single anonymous/named query; required for multiple named queries. It must match one unique query name. All three fields support per-input expressions; the original query is sent unchanged.

For example, after confirming the fields and scalar types in your explorer:

```graphql
query Page($take: Int!, $skip: Int!) {
  selected: buildings(take: $take, skip: $skip) {
    id
    name
  }
}
query Names($take: Int!, $skip: Int!) {
  buildings(take: $take, skip: $skip) { name }
}
```

Set Variables to `{"take":2,"skip":0}` and Operation Name to `Page` (or `Names`). Missing/unknown/duplicate names and anonymous-plus-other-operation documents fail before any BDP request. The maintained parser checks syntax and examines **every operation**, rejecting any mutation or subscription even when an otherwise valid query is selected. Schema validation remains server-side. Local query-only enforcement is not a reduction of the credential's permissions outside this node.

### Output and failures

One successful input produces exactly one paired n8n item, for example:

```json
{"data":{"selected":[]},"extensions":{"example":true}}
```

The node preserves the entire parsed envelope, including nested lists/objects, aliases, null field values, native types, optional extensions, and an empty errors array. Empty collections still produce one envelope item. It does not flatten, enrich, or split responses; downstream expressions can use `$json.data.selected` and standard **Split Out** nodes can split a chosen collection.

Any non-empty GraphQL `errors` array fails, including HTTP 200 responses with partial data. No partial data becomes ordinary successful output. Error diagnostics retain server messages and available codes, locations, and paths without dumping documents, variables, extensions, or partial results. Known credential secrets are redacted; server messages can still describe user-supplied field/filter values, so handle execution logs as potentially sensitive. Malformed/non-JSON, batch, and streaming envelopes fail explicitly.

Use n8n's standard **On Error**/continue-on-error settings to route linked error items. There is no separate partial-success option. Local validation and permanent application/authentication errors are not retried. Shared transport retries eligible network failures and HTTP 429/500/502/503/504 at most three times, honoring valid Retry-After values up to 60 seconds; an unusable or longer Retry-After stops instead of retrying early. Each GraphQL attempt has a 60-second timeout. The supported n8n OAuth helper manages token acquisition and bounded expired-token reacquisition using client credentials, with no second token store, hard-coded token lifetime, or refresh-token requirement.

### Explicit pagination and nested traversal

Import [`examples/graphql-two-pages.json`](examples/graphql-two-pages.json), bind your credential, and review its synthetic query against your explorer. A standard Loop Over Items node executes two visible page inputs: `{ "take": 2, "skip": 0 }` and `{ "take": 2, "skip": 2 }`. Complete envelopes flow through a normal downstream node and back to the loop. This demonstrates **two pages of the buildings collection only**, not a Return All operation or a completeness guarantee.

[`examples/graphql-nested-query.json`](examples/graphql-nested-query.json) provides a bounded building → equipment → points template with a synthetic UUID and separate collection bounds. Replace the ID and confirm the `UUID` scalar, relationships, point fields, and nested `take` support against your environment before executing. It also contains a second named query to demonstrate explicit operation selection.

There is no automatic pagination, injected `take`/`skip`, query rewriting, metadata request, or hidden result cap. Every root and nested collection needs its own bounds and, when needed, its own workflow paging strategy. Server depth, complexity, permission, and response-size limits still apply and may vary by environment; use small bounds and reduce query breadth/depth when denied. The phase-one 1,000-history-record acceptance target is **not** a GraphQL limit or completeness promise.

Execution is stateless: requests are not snapshots, checkpoints, managed synchronization, or exactly-once reads. Point values are current context; GraphQL historical retrieval and subscriptions are not promised. REST measurement IDs and GraphQL point IDs are not assumed interchangeable.

### Parser provenance and packaging

The runtime parser is the explicitly declared [`graphql` / GraphQL.js](https://github.com/graphql/graphql-js) **16.15.0** (MIT), from the maintained 16.x CommonJS-compatible release line. It is installed normally from npm via `dependencies` and the lockfile, not vendored, hidden in a bundle, or borrowed from an undocumented n8n transitive dependency. The npm-installed dependency includes its upstream license. The package archive contains compiled node/credential code, theme assets, public documentation, and synthetic workflows; npm installs the parser alongside it. Private `.local/` documentation, schemas, credentials, development inputs, and customer data are excluded from both Git and the archive.

Self-hosted lint configuration intentionally disables Cloud-only dependency restrictions, not parser validation or TypeScript strictness. Publication continues through the existing `npm run release` and tag-triggered GitHub Actions workflow after maintainer approval; Phase two does not publish an npm version automatically.

### Acceptance status

Automated parser/adapter/node checks and REST regressions use only synthetic fixtures and mocked HTTP. The Docker smoke procedure installs the actual archive (no source mounts or development links), checks discovery of the credential and GraphQL/REST operations and assets, imports the example workflows, and verifies the installed query path with mocked transport.

Offline acceptance on 2026-11-09 passed build/lint and **114 automated tests**, including unchanged REST defaults/outputs and actual n8n expression evaluation. Clean archive installation passed in **n8n 2.44.4 / Node.js 26.10.0**, package **0.1.0**, parser **16.15.0**. Both GraphQL examples imported successfully; the running n8n instance discovered the shared credential, GraphQL Execute Query, and all existing REST operations (including the separate Building Get). A Docker-only native OAuth harness also verified acquisition, `expires_in`-derived expiry metadata, token persistence, one 401 client-credentials reacquisition, secret redaction, and failure on a second 401, using a synthetic loopback token server and mocked BDP responses. That version-pinned harness inspects n8n internals only in tests; the shipped integration uses the supported authenticated-request helper exclusively.

**Live UAT acceptance is pending.** Phase one already provides the shared credential; it is reused without migration or re-entry. The existing local n8n instance holding that credential was stopped during these checks and was not restarted, to avoid activating scheduled workflows. The supplied local reference confirms endpoint/header policy but does not prove live field/scalar availability or GraphQL authorization. Nested traversal, named selection, both live page-variable sets, empty results, server validation errors, and a live REST read in the installed Docker environment must be recorded before closing the live-acceptance tickets. Local tests reject writes without sending any to UAT. Do not treat example templates, successful package installation, or mocked outputs as live acceptance.

## Troubleshooting

- **Authentication failed:** verify the tenant ID, client ID, client secret, and application scope with your BDP administrator.
- **Access denied:** verify that the application has permission to access the selected environment and requested building.
- **No results:** an empty list is valid; check the building selection, filters, access scope, and time window.
- **Selector search fails:** choose a resolved building before searching measurement points, or enter an ID manually. Unresolved expressions are not used to issue unrelated searches.
- **GraphQL validation error:** inspect the returned message/code/location/path and confirm the field, scalar types, and permissions in your environment's explorer. HTTP 200 does not mean a query succeeded.
- **GraphQL invalid envelope/content type:** check the environment's API response and proxy configuration. Batch arrays, multipart incremental responses, HTML, and missing/object-less success data are not accepted.

## Support and scope

This package is independently maintained. Open implementation issues in [the repository](https://github.com/fboucher/n8n-nodes-bdp/issues); BDP access, tenant configuration, and API permissions remain the responsibility of your administrator.

UAT workflow validation, a clean Docker installation, and publishing require maintainer-provided UAT access and approved npm/GitHub publishing configuration. These deployment checks are not implied by the mocked automated tests.

## License

[MIT](LICENSE.md)
