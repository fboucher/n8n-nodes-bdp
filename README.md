# n8n-nodes-bdp

This is an n8n community node. It lets you read data from, and write data to, Schneider Electric EcoStruxure **Building Data Platform (BDP)** in your n8n workflows.

Building Data Platform (BDP) exposes organization, site, building, floor, measurement point, and historical telemetry data through REST and GraphQL APIs. This node provides read-only access through GraphQL and read access plus a small, explicit set of write operations through REST.

> **Warning:** write operations change data in BDP and can reach physical equipment. There is no undo. Test on a designated test point first. **Set On Demand and Run On Demand send commands straight to the real source system and are the highest-risk operations; they are never retried automatically.**

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

> This is an independent community package, not an official Schneider Electric product.

[Installation](#installation) · [Operations](#operations) · [Credentials](#credentials) · [Compatibility](#compatibility) · [Usage](#usage) · [Documentation](#documentation) · [Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation and install `n8n-nodes-bdp`.

To try it locally without publishing, see [Docker Compose setup](docs/docker-compose.md).

## Operations

| Resource | Operations |
| --- | --- |
| Building | List, Get, Historical Values |
| Dataset | List, Get, Create, Update, Delete |
| Device | List, Get, Historical Values |
| Device Group | List, Get, Historical Values, Get On Demand, Set On Demand |
| Event Hub | List, Get, Update |
| Floor | List, Get, Historical Values |
| Measurement Point | List, Get, Historical Values, Update |
| Organization | List, Get |
| Site | List, Get |
| Source | List, Get, Run On Demand |
| Space | List, Get, Historical Values |
| Telemetry | Send |
| GraphQL | Execute Query (read-only) |

List, Get, and Historical Values operations are read-only, and GraphQL stays read-only. Only the operations named in [Write operations](docs/operations.md#write-operations) send writes; subscriptions are not supported. See [REST operations](docs/operations.md) and [GraphQL](docs/graphql.md) for details.

Building List can target all accessible buildings, an organization, or a site, with optional server-side filters and counts. Building Get can also request counts; the Building selector can be narrowed to an organization or site.

Floor List returns floors within a selected building, with optional name, reference ID, metadata, space-count, measurement-count, and ordering filters. Floor Get accepts a manual ID or a searchable selection scoped to the current building.

Space List returns spaces either **In building** or **On floor**, showing only the relevant parent selector, with optional name, reference ID, metadata, ontology type, measurement-count, Commissioned Status, and ordering filters. Space Get accepts a manual ID or a searchable selection scoped to the chosen building or floor.

Source List returns the integration sources accessible to you, with optional type, name, and ordering filters; Source Get accepts a manual ID or a searchable selection. Source Run On Demand sends a command to the source system; see the warning below.

Device List has a Scope of In building, On floor, In space, or From source, showing only the relevant parent selector, with optional name, metadata, reference ID, ontology type, product type, vendor identifier, Commissioned Status, and ordering filters. Device Get accepts a manual ID or a searchable selection scoped to the chosen parent.

Device Group List has a Scope of In building or From source, with optional reference ID, metadata, Commissioned Status, Commissioned Before, Decommissioned After, and ordering filters. The two timestamps must be ISO 8601 with seconds and an explicit UTC offset or Z, and are normalized to UTC. Device Group Get accepts a manual ID or a searchable selection. Device Group Get On Demand reads live values from the source system, and Set On Demand writes values to it; see the warning below.

Dataset List returns the datasets available to your application, with optional name and ordering filters; Dataset Get accepts a manual ID or a searchable selection. Dataset Create, Update, and Delete are writes: Create needs a name, an expiry (ISO 8601 with an explicit offset) and members; Update changes any of name, expiry, or members (members are replaced as a whole); Delete cannot be undone. See [Write operations](docs/operations.md#write-operations).

Event Hub List returns the event hubs configured for your application, with optional name and ordering filters; Event Hub Get accepts a manual ID or a searchable selection. Event Hub Update changes partition count, retention policy, consumer groups, or telemetry payload format, and affects downstream consumers (see [Write operations](docs/operations.md#write-operations)). Because the response schema was not available when this was built, any field whose name looks like a credential (connection string, key, secret, token, password, SAS) is returned as `[REDACTED]`; see [REST operations](docs/operations.md).

Measurement Point List has a Scope of In building (the default, unchanged), On floor, In space, On device, In device group, or In dataset, showing only the relevant parent selector. It supports name, ontology type, unit, reference ID, metadata, context, Writeable, Updated After, Commissioned Status, and ordering filters; unset filters are not sent, and Updated After uses the same strict ISO 8601 validation and UTC normalization as historical values. Measurement Point Get accepts a manual ID or a searchable selection, and the Measurement Point selector follows the chosen scope. Workflows saved before scopes existed keep using the building.

**Historical Values** is an operation on each parent resource: Building, Floor, Space, Device, Device Group, and Measurement Point. Floor, Space, Device, and Device Group Historical Values read their values directly (`GET /api/{Floors|Spaces|Devices|DeviceGroups}/{id}/HistoricalValues`) without listing measurement points first, using the same required Start and End (strict ISO 8601, UTC-normalized, Start earlier than End), ascending order, Return All / Limit pagination, and error handling as Building history.

## Credentials

Create a **BDP Community OAuth2 API** credential with the tenant ID, client ID, client secret, and scope provided by your BDP administrator, then choose the UAT or Production environment. Telemetry **Send** uses a separate **BDP Telemetry Ingress API** credential (environment, device ID, and SAS token from the BDP Portal). See [Credentials](docs/credentials.md).

Telemetry Send pushes time-series values into BDP through the Telemetry Ingress API, one entry per input item. It validates the source ID (UUID), timestamps (strict ISO 8601, sent in UTC) and values before any request, splits large inputs into messages of at most 4 KB, and is never retried automatically, so a timeout cannot duplicate data. BDP silently drops messages whose IDs it does not know, so a successful send means the hub accepted the message, not that BDP ingested every point. See [REST operations](docs/operations.md#telemetry-send).

## Compatibility

- Self-hosted n8n only, tested against n8n **2.44.4**. Not eligible for n8n Cloud because of the `graphql` runtime dependency.
- Runtime: Node.js 22 or later, matching the n8n community-node runtime requirement.
- Development and build tooling: Node.js 24 or later.

## Usage

Import an [example workflow](examples/README.md) to list buildings, floors, and spaces (rooms), read building history, or schedule history reads. Choose the **local** or **npm** folder to match your installation; each workflow's sticky notes explain its setup.

Having trouble? See [Troubleshooting](docs/troubleshooting.md).

## Documentation

- [Credentials](docs/credentials.md)
- [REST operations](docs/operations.md)
- [GraphQL Execute Query](docs/graphql.md)
- [Local Docker Compose setup](docs/docker-compose.md)
- [Development](docs/development.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Acceptance status](docs/acceptance-status.md)

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- BDP API reference (Access / Egress):
  - [REST API](https://exchange.se.com/devportal/?api=bdp-api-spec-v3-bundle&id=122362)
  - [GraphQL API](https://exchange.se.com/devportal/?api=bdp-graphql-api-spec-v1&id=122362)
- BDP API reference (Ingress / Data Provider), used by Telemetry Send:
  - [REST API](https://exchange.se.com/devportal/?api=bdp-ingress-api-spec-v1-bundle&id=894350)
- [Report an issue](https://github.com/fboucher/n8n-nodes-bdp/issues)

## License

[MIT](LICENSE.md)
