# REST operations

The node reads from **Building Data Platform (BDP)** REST API v3.0 using a fixed UAT or Production host selected by the [credential](credentials.md). List, Get, and Historical Values operations are read-only. The operations listed under [Write operations](#write-operations) are the only ones that send writes.

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
| Floor | Historical Values | Reads history for a floor via `GET /api/Floors/{floorId}/HistoricalValues`. |
| Space | Historical Values | Reads history for a space via `GET /api/Spaces/{spaceId}/HistoricalValues`. |
| Device | Historical Values | Reads history for a device via `GET /api/Devices/{deviceId}/HistoricalValues`. |
| Device Group | Historical Values | Reads history for a device group via `GET /api/DeviceGroups/{deviceGroupId}/HistoricalValues`. |
| Data Set | List | Lists accessible data sets via `GET /api/DataSets`; optional name and ordering filters. |
| Data Set | Get | Retrieves the full native record for one selected or manually entered data set ID via `GET /api/DataSets/{dataSetId}`. |
| Data Set | Create | **Write.** Creates a data set via `POST /api/DataSets`. |
| Data Set | Update | **Write.** Changes name, expiry, and/or members via `PATCH /api/DataSets/{dataSetId}`. |
| Data Set | Delete | **Write.** Deletes a data set via `DELETE /api/DataSets/{dataSetId}`. Cannot be undone. |
| Event Hub | List | Lists configured event hubs via `GET /api/EventHubs`; optional name and ordering filters. Credential-like fields are redacted. |
| Event Hub | Get | Retrieves one event hub via `GET /api/EventHubs/{eventHubId}` by selected or manually entered ID. Credential-like fields are redacted. |
| Event Hub | Update | **Write.** Changes partition count, retention policy, consumer groups, and/or telemetry payload format via `PATCH /api/EventHubs/{eventHubId}`. |
| Measurement Point | List | Lists points in a building (default), on a floor, in a space, on a device, in a device group, or in a data set; optional name, ontology-type, unit, reference ID, metadata, context, writeable, updated-after, commissioned status, and ordering filters. |
| Measurement Point | Get | Retrieves one point via `GET /api/MeasurementValues/{measurementId}` by selected or manually entered ID. |
| Measurement Point | Historical Values | Reads history from the dedicated measurement-point endpoint. |
| Measurement Point | Update | **Write.** Replaces the numeric value of one point (`PATCH /api/MeasurementValues/{measurementId}`) or of many points in a device group (`PATCH /api/DeviceGroups/{deviceGroupId}/MeasurementValues`). See [Write operations](#write-operations). |

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

Importable workflows for scheduled point history and direct building history are in [`examples/`](../examples/README.md).

Floor **List** requires a Building and calls `GET /api/Buildings/{buildingId}/Floors`. It defaults to a 100-record Limit and supports **Return All**. Floor **Get** calls `GET /api/Floors/{floorId}`. Select a Building to search its floors by name, or enter a Floor ID directly without a building. Floor searches always use the currently selected building, including after changing it. The Building selector also supports **Building Search Scope**.

Space **List** has a **Scope** of In building (`GET /api/Buildings/{buildingId}/Spaces`) or On floor (`GET /api/Floors/{floorId}/Spaces`). Only the selected scope's parent is shown; to search floors by name, also pick a Building, or enter a Floor ID directly. Space **Get** calls `GET /api/Spaces/{spaceId}`; its selector searches the chosen building or floor, and a manual ID needs no parent. Commissioned Status is a constrained option (Any, Commissioned, Decommissioned).

Source **List** and **Get** only issue GET requests. `POST /api/Sources/{sourceId}/OnDemand/{methodName}` is deliberately out of scope and cannot be sent from this resource.

Device **List** calls `GET /api/Buildings/{id}/Devices`, `/api/Floors/{id}/Devices`, `/api/Spaces/{id}/Devices`, or `/api/Sources/{id}/Devices` depending on **Scope**; only the selected scope's parent selector is shown. Device **Get** calls `GET /api/Devices/{deviceId}`; its selector searches the chosen parent, and a manual ID needs no parent.

Device Group **List** calls `GET /api/Buildings/{id}/DeviceGroups` or `/api/Sources/{id}/DeviceGroups`; **Commissioned Before** and **Decommissioned After** use the same strict ISO 8601 validation and UTC normalization as historical values. Device Group **Get** calls `GET /api/DeviceGroups/{deviceGroupId}`. Only GET requests are issued; `GetOnDemand` and `SetOnDemand` are deliberately out of scope.

Data Set **List** and **Get** only issue GET requests; Create, Update, and Delete are separate operations described under [Write operations](#write-operations).

Event Hub **List** and **Get** only issue GET requests; Update is a separate operation described under [Write operations](#write-operations). **Secrets decision:** event hub records may describe a connection to an external messaging service, and the response schema was not available for review. To avoid leaking credentials into execution data and logs, any field at any depth whose name looks like a credential (connection string, secret, password, token, credential, signature, SAS, `key`, or access/primary/secondary/shared/api/private/signing/account/auth key) is returned as `[REDACTED]`; all other fields keep their native values and types. Please review a real response and tighten or relax this rule once the schema is confirmed.

Measurement Point **List** calls `GET /api/{Buildings|Floors|Spaces|Devices|DeviceGroups|DataSets}/{id}/MeasurementValues` depending on **Scope**; the default In building scope sends exactly the request earlier versions did. Only the selected scope's parent selector is shown, and for Get and Historical Values **Measurement Point Search Scope** controls where the Measurement Point selector searches (manual IDs need no parent). New filters are optional and server-side; omitted ones are not sent. List, Get and Historical Values never write; see Update under [Write operations](#write-operations).

**Historical Values design:** history is an operation on each parent resource (Building, Floor, Space, Device, Device Group, Measurement Point), not a scope of another operation. Select the parent (its selector can be narrowed as for Get), then enter Start and End. They use the same strict ISO 8601 validation with seconds and an explicit UTC offset or Z, UTC normalization, ascending order, Start earlier than End, Return All / Limit, retries, and later-page failure handling as Building history. Existing Building and Measurement Point history are unchanged.

## Write operations

> **Warning: writes can reach physical equipment.** BDP forwards some values to real building systems, and there is no undo. Test on a designated test point or test data first, and use the node's **Continue On Fail** deliberately.

Writes are explicit operations (Update, Create, Delete, Send). No write is reachable from a List, Get, or Historical Values operation, and the GraphQL resource stays read-only. Every write goes through one allowlisted code path (see [Development](development.md#write-operations)).

Common rules:

- **No automatic retry.** A write that fails with a transient error (429, 5xx, a network error) is reported once and is not repeated, because the first attempt may have taken effect. Check the target, then re-run deliberately.
- **Safe errors.** Messages state the HTTP status and what to check. They never include credentials, tokens, or the request body.
- **Validation first.** Inputs are validated before any credential lookup or request.

### Measurement Point: Update

Replaces the numeric `value` of a measurement point. Nothing else can be changed, and measurement points cannot be deleted through this operation. The point must be writeable; the **Only Writeable Points** option (on by default) limits the selector to points that accept writes (`isWriteable`).

**Single mode** writes one value per input item: pick the point (From list or By ID, optionally narrowed by a search scope) and enter the value. It sends one `PATCH /api/MeasurementValues/{measurementId}` with `[{"op":"replace","path":"/value","value":<number>}]` and returns `{ measurementId, value, status: "success", statusCode: 204 }`.

**Batch mode** takes one input item per point and sends one `PATCH /api/DeviceGroups/{deviceGroupId}/MeasurementValues` for the device group. Set **Measurement ID** (a UUID) and **Value** (a number) per item; by default they read `$json.measurementId` and `$json.value`. All items must use the same device group, and a point may appear only once. Every ID and value is validated before the first request.

Batch output has one item per input item, linked to it, with a `status`:

| status | Meaning |
| --- | --- |
| `success` | BDP accepted the point (200 or 204, or a 206 that did not list it as failed). |
| `failed` | BDP returned a per-point error in a `206 Partial Content` response. Includes `statusCode`, `errorCode` (when given), and `error`. Other points in the same request were still applied. |
| `unconfirmed` | BDP returned `206` without usable per-point details. Verify these points. |

Branch on `status` (for example with an IF node) to handle failed points. A `206` is never reported as full success.

**Batch size.** Inputs larger than 500 points are split into sequential requests of 500; they are never truncated. If a later request fails, the error says how many points were already sent. The 500-point chunk size is a conservative default; the API's real limit still has to be confirmed in UAT.

**Errors.** `400` (unknown point, wrong value type, or point not writeable), `403`, `404`, `413`, `429`, and `504` each produce a short message with the status and no request body.

### Data Set: Create, Update, Delete

**Create** (`POST /api/DataSets`) needs **Name**, **Expires On**, and **Members**. Expires On uses the same strict ISO 8601 validation as other timestamps (seconds and an explicit UTC offset or `Z`) and is sent in UTC. Members is JSON listing member IDs (UUIDs) by category: `buildings`, `floors`, `spaces`, `devices`, `measurementValues`; categories you leave out are sent as empty lists. All three are validated before any request, and the created data set is returned as BDP sent it. **Create is never retried**, because a repeat could create a second data set; to avoid duplicates after an ambiguous failure, look the data set up by name first.

**Update** (`PATCH /api/DataSets/{dataSetId}`) lets you change any combination of name, expiry, and members, and sends one `replace` operation per field you set. Setting no field is rejected. **Members are replaced as a whole**: the API does not support partial member edits, so the members you provide become the complete list, and categories you omit become empty. Read the data set first (Data Set Get) if you want to add to the existing members.

**Delete** (`DELETE /api/DataSets/{dataSetId}`) removes the selected or manually entered data set and returns `{ id, status: "deleted" }`. **Deletion cannot be undone.** Delete is not retried.

Errors: `400`, `404`, `413` (too large), and `424` (a referenced device or ID failed) produce short messages with the HTTP status and no request body.

### Event Hub: Update

`PATCH /api/EventHubs/{eventHubId}` replaces any combination of **Partition Count** (a whole number), **Retention Policy** (text), **Consumer Groups** (comma-separated names, replacing the whole list), and **Telemetry Payload Format** (text). One `replace` is sent per field you set; setting none is rejected, and types are checked before any request.

> **Warning:** event hub changes affect every downstream consumer of its telemetry. BDP may reject reductions of partitions or retention; that returns a safe `400` message without the request body.

The response is returned as a native record with the same redaction rule as List and Get (credential-like fields become `[REDACTED]`; see the secrets decision above).

## Out of scope

The node does not provide generic HTTP requests, GraphQL mutations, subscriptions, enrichment, cursors, or exactly-once guarantees.
