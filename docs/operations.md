# REST operations

The node reads from **Building Data Platform (BDP)** REST API v3.0 using a fixed UAT or Production host selected by the [credential](credentials.md). All operations are read-only.

| Resource | Operation | Behavior |
| --- | --- | --- |
| Organization | List | Lists accessible native organization records; optional name, site-count, and ordering filters. |
| Organization | Get | Retrieves the full native record for one selected or manually entered organization ID. |
| Site | List | Lists accessible sites or sites within a selected organization; optional name, metadata, building-count, and ordering filters. |
| Site | Get | Retrieves the full native record for one selected or manually entered site ID. |
| Building | List | Lists all accessible buildings by default, or buildings within an organization or site; optional server-side filters, counts, ordering, and Limit. |
| Building | Get | Retrieves the full native record for one selected or manually entered building ID, optionally including counts. |
| Building | Historical Values | Reads building-wide history directly without enumerating points. |
| Floor | List | Lists native floors within a selected building; optional name, reference ID, metadata, space-count, measurement-count, and ordering filters. |
| Floor | Get | Retrieves the full native record for one selected or manually entered floor ID. |
| Space | List | Lists native spaces in a building or on a floor; optional name, reference ID, metadata, ontology type, measurement-count, commissioned status, and ordering filters. |
| Space | Get | Retrieves the full native record for one selected or manually entered space ID. |
| Source | List | Lists accessible integration sources via `GET /api/Sources`; optional type, name, and ordering filters. |
| Source | Get | Retrieves the full native record for one selected or manually entered source ID via `GET /api/Sources/{sourceId}`. |
| Device | List | Lists native devices in a building, on a floor, in a space, or from an integration source; optional name, metadata, reference ID, ontology type, product type, vendor identifier, commissioned status, and ordering filters. |
| Device | Get | Retrieves the full native record for one selected or manually entered device ID. |
| Device Group | List | Lists native device groups in a building or from a source; optional reference ID, metadata, commissioned status, commissioned-before, decommissioned-after, and ordering filters. |
| Device Group | Get | Retrieves the full native record for one selected or manually entered device group ID. |
| Data Set | List | Lists accessible data sets via `GET /api/DataSets`; optional name and ordering filters. |
| Data Set | Get | Retrieves the full native record for one selected or manually entered data set ID via `GET /api/DataSets/{dataSetId}`. |
| Event Hub | List | Lists configured event hubs via `GET /api/EventHubs`; optional name and ordering filters. Credential-like fields are redacted. |
| Event Hub | Get | Retrieves one event hub via `GET /api/EventHubs/{eventHubId}` by selected or manually entered ID. Credential-like fields are redacted. |
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

Building **List** supports name, reference ID, metadata, floor count, space count, measurement count, and ordering filters. Enable **Include Counts** to request counts on List or Get; it is omitted by default. For Building Get, Historical Values, and the Measurement Point building selector, **Building Search Scope** can narrow the selector to an organization or site without changing the selected building's ID or detail endpoint.

Importable sanitized workflows for scheduled point history and direct building history are in [`examples/`](../examples/).

Floor **List** requires a Building and calls `GET /api/Buildings/{buildingId}/Floors`. It defaults to a 100-record Limit and supports **Return All**. Floor **Get** calls `GET /api/Floors/{floorId}`. Select a Building to search its floors by name, or enter a Floor ID directly without a building. Floor searches always use the currently selected building, including after changing it. The Building selector also supports **Building Search Scope**.

Space **List** has a **Scope** of In building (`GET /api/Buildings/{buildingId}/Spaces`) or On floor (`GET /api/Floors/{floorId}/Spaces`). Only the selected scope's parent is shown; to search floors by name, also pick a Building, or enter a Floor ID directly. Space **Get** calls `GET /api/Spaces/{spaceId}`; its selector searches the chosen building or floor, and a manual ID needs no parent. Commissioned Status is a constrained option (Any, Commissioned, Decommissioned).

Source **List** and **Get** only issue GET requests. `POST /api/Sources/{sourceId}/OnDemand/{methodName}` is deliberately out of scope and cannot be sent from this resource.

Device **List** calls `GET /api/Buildings/{id}/Devices`, `/api/Floors/{id}/Devices`, `/api/Spaces/{id}/Devices`, or `/api/Sources/{id}/Devices` depending on **Scope**; only the selected scope's parent selector is shown. Device **Get** calls `GET /api/Devices/{deviceId}`; its selector searches the chosen parent, and a manual ID needs no parent.

Device Group **List** calls `GET /api/Buildings/{id}/DeviceGroups` or `/api/Sources/{id}/DeviceGroups`; **Commissioned Before** and **Decommissioned After** use the same strict ISO 8601 validation and UTC normalization as historical values. Device Group **Get** calls `GET /api/DeviceGroups/{deviceGroupId}`. Only GET requests are issued; `GetOnDemand` and `SetOnDemand` are deliberately out of scope.

Data Set **List** and **Get** only issue GET requests; create, update, and delete are deliberately out of scope.

Event Hub **List** and **Get** only issue GET requests; the PATCH endpoint is deliberately out of scope. **Secrets decision:** event hub records may describe a connection to an external messaging service, and the response schema was not available for review. To avoid leaking credentials into execution data and logs, any field at any depth whose name looks like a credential (connection string, secret, password, token, credential, signature, SAS, `key`, or access/primary/secondary/shared/api/private/signing/account/auth key) is returned as `[REDACTED]`; all other fields keep their native values and types. Please review a real response and tighten or relax this rule once the schema is confirmed.

## Out of scope

The node does not provide generic HTTP requests, writes, commands, subscriptions, enrichment, cursors, or exactly-once guarantees.
