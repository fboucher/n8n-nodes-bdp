# GraphQL Execute Query

**GraphQL → Execute Query** runs one read-only query per input item against the **Building Data Platform (BDP)** `/graphql` endpoint. It lives in the same Building Data Platform node and uses the same **BDP Community OAuth2 API** [credential](credentials.md); the credential's environment selects the endpoint on the corresponding REST host.

Requests use authenticated JSON POST with `Accept: application/json` and `Content-Type: application/json`. The REST-only `X-Api-Version: 3.0` header is not sent. A successful REST credential test alone does not establish GraphQL permission, so confirm access in your environment.

## Authoring queries

Author against the **existing BDP GraphQL explorer** supplied by your administrator. Confirm field names, relationships, scalar types, filters, permissions, and server limits there. The node does not introspect, cache, or ship a schema. The examples below are synthetic templates, not live UAT evidence.

- **Query:** required multiline document, resolved separately for each input item. Standard anonymous/named queries, aliases, fragments, directives, comments, and variable definitions are supported.
- **Variables:** JSON object, default `{}`, or an n8n expression returning an object, such as `={{ { take: $json.take, skip: $json.skip } }}`. Arrays, scalars, `null`, invalid JSON, and non-JSON values at the top level fail locally. Nested JSON values retain their types.
- **Operation Name:** optional for a single anonymous/named query; required for multiple named queries. It must match one unique query name.

All three fields support per-input expressions; the original query is sent unchanged.

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

Set Variables to `{"take":2,"skip":0}` and Operation Name to `Page` (or `Names`).

## Query-only enforcement

Missing, unknown, or duplicate operation names, and anonymous-plus-other-operation documents, fail before any BDP request. The parser checks syntax and examines **every operation**, rejecting any mutation or subscription even when an otherwise valid query is selected. Schema validation remains server-side. Local query-only enforcement does not reduce the credential's permissions outside this node.

## Output

One successful input produces exactly one paired n8n item, for example:

```json
{"data":{"selected":[]},"extensions":{"example":true}}
```

The node preserves the entire parsed envelope, including nested lists/objects, aliases, null field values, native types, optional extensions, and an empty errors array. Empty collections still produce one envelope item. It does not flatten, enrich, or split responses; use expressions such as `$json.data.selected` or a standard **Split Out** node downstream.

## Errors and retries

Any non-empty GraphQL `errors` array fails, including HTTP 200 responses with partial data. No partial data becomes ordinary successful output. Error diagnostics retain server messages and available codes, locations, and paths without dumping documents, variables, extensions, or partial results. Known credential secrets are redacted; server messages can still describe user-supplied field/filter values, so treat execution logs as potentially sensitive. Malformed/non-JSON, batch, and streaming envelopes fail explicitly.

Use n8n's standard **On Error** / continue-on-error settings to route linked error items. There is no separate partial-success option.

Local validation and permanent application/authentication errors are not retried. Shared transport retries eligible network failures and HTTP 429/500/502/503/504 at most three times, honoring valid `Retry-After` values up to 60 seconds; an unusable or longer `Retry-After` stops instead of retrying early. Each attempt has a 60-second timeout. Token acquisition and bounded expired-token reacquisition are handled by n8n's OAuth helper using client credentials.

## Pagination and nested traversal

There is no automatic pagination, injected `take`/`skip`, query rewriting, metadata request, or hidden result cap. Every root and nested collection needs its own bounds and, when needed, its own workflow paging strategy. Server depth, complexity, permission, and response-size limits still apply and may vary by environment; use small bounds and reduce query breadth/depth when denied.

- [`examples/graphql-two-pages.json`](../examples/graphql-two-pages.json) uses a Loop Over Items node to execute two page inputs, `{ "take": 2, "skip": 0 }` and `{ "take": 2, "skip": 2 }`. It demonstrates two pages of the buildings collection only, not a Return All operation or a completeness guarantee.
- [`examples/graphql-nested-query.json`](../examples/graphql-nested-query.json) is a bounded building → equipment → points template with a synthetic UUID and separate collection bounds. Replace the ID and confirm the `UUID` scalar, relationships, point fields, and nested `take` support before executing. It also contains a second named query to demonstrate operation selection.

Execution is stateless: requests are not snapshots, checkpoints, managed synchronization, or exactly-once reads. Point values are current context; GraphQL historical retrieval and subscriptions are not supported. REST measurement IDs and GraphQL point IDs are not assumed interchangeable.

## Parser

The runtime parser is [`graphql` / GraphQL.js](https://github.com/graphql/graphql-js) **16.15.0** (MIT), declared in `dependencies` and installed from npm alongside the package. It is not vendored or bundled. Because of this runtime dependency, the package targets self-hosted n8n and is not eligible for n8n Cloud verification.
