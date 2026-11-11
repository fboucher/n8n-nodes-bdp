# REST operations

The node reads from **Building Data Platform (BDP)** REST API v3.0 using a fixed UAT or Production host selected by the [credential](credentials.md). All operations are read-only.

| Resource | Operation | Behavior |
| --- | --- | --- |
| Organization | List | Lists accessible native organization records; optional name, site-count, and ordering filters. |
| Organization | Get | Retrieves the full native record for one selected or manually entered organization ID. |
| Site | List | Lists accessible sites or sites within a selected organization; optional name, metadata, building-count, and ordering filters. |
| Site | Get | Retrieves the full native record for one selected or manually entered site ID. |
| Building | List | Lists all accessible native building records by default, following pagination; optional server-side name filter and optional Limit. |
| Building | Get | Retrieves the full native record for one selected or manually entered building ID. |
| Building | Historical Values | Reads building-wide history directly without enumerating points. |
| Measurement Point | List | Lists points in a selected building; optional name, ontology-type, and unit filters. |
| Measurement Point | Historical Values | Reads history from the dedicated measurement-point endpoint. |

For GraphQL queries, see [GraphQL](graphql.md).

## Pagination and limits

Building List defaults to **Return All**, so it follows pagination to list all accessible buildings. Turn Return All off to apply its optional Limit (default 100). Organization, Site, and other list and historical operations retain their 100-record Limit default with an explicit **Return All** option.

Each API page requests no more than 5,000 records. Results preserve the API's native fields and value types and are returned as individually linked n8n items; empty results produce zero items.

The node uses ascending timestamp order and preserves filters and time windows across pages. It retries eligible transient failures a bounded number of times, honors a usable `Retry-After`, and fails the operation if a later page fails. Offset pagination over a changing dataset may still produce gaps or duplicates; scheduling, overlap, and deduplication are workflow responsibilities.

## Historical time windows

Historical Start and End fields require ISO 8601 timestamps with seconds and an explicit `Z` or UTC offset, for example `2025-01-01T00:00:00Z` or `2025-01-01T01:00:00+01:00`. The node normalizes valid offsets to UTC and rejects ambiguous local timestamps and windows where Start is not earlier than End. BDP determines whether the time boundaries are inclusive.

## Example

A minimal building-list configuration. Bind your own BDP credential and select its environment:

```json
{
  "resource": "building",
  "operation": "getAll",
  "returnAllBuildings": true
}
```

Organization and Site **List** can return all accessible records or narrow sites to an organization. Use **Get** when you need the full details for one organization, site, or building ID; **List** calls the collection endpoint and returns each accessible record separately.

Importable sanitized workflows for scheduled point history and direct building history are in [`examples/`](../examples/).

## Out of scope

The node does not provide generic HTTP requests, writes, commands, subscriptions, enrichment, cursors, or exactly-once guarantees.
