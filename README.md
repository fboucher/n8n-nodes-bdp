# n8n-nodes-bdp

This is an n8n community node. It lets you read data from Schneider Electric EcoStruxure **Building Data Platform (BDP)** in your n8n workflows.

Building Data Platform (BDP) exposes organization, site, building, floor, measurement point, and historical telemetry data through REST and GraphQL APIs. This node provides read-only access to both.

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
| Data Set | List, Get |
| Device | List, Get |
| Device Group | List, Get |
| Event Hub | List, Get |
| Floor | List, Get |
| Measurement Point | List, Historical Values |
| Organization | List, Get |
| Site | List, Get |
| Source | List, Get |
| Space | List, Get |
| GraphQL | Execute Query (read-only) |

All operations are read-only. Writes, commands, and subscriptions are not supported. See [REST operations](docs/operations.md) and [GraphQL](docs/graphql.md) for details.

Building List can target all accessible buildings, an organization, or a site, with optional server-side filters and counts. Building Get can also request counts; the Building selector can be narrowed to an organization or site.

Floor List returns floors within a selected building, with optional name, reference ID, metadata, space-count, measurement-count, and ordering filters. Floor Get accepts a manual ID or a searchable selection scoped to the current building.

Space List returns spaces either **In building** or **On floor**, showing only the relevant parent selector, with optional name, reference ID, metadata, ontology type, measurement-count, Commissioned Status, and ordering filters. Space Get accepts a manual ID or a searchable selection scoped to the chosen building or floor.

Source List returns the integration sources accessible to you, with optional type, name, and ordering filters; Source Get accepts a manual ID or a searchable selection. This resource is strictly read-only: the on-demand command endpoint is not supported.

Device List has a Scope of In building, On floor, In space, or From source, showing only the relevant parent selector, with optional name, metadata, reference ID, ontology type, product type, vendor identifier, Commissioned Status, and ordering filters. Device Get accepts a manual ID or a searchable selection scoped to the chosen parent.

Device Group List has a Scope of In building or From source, with optional reference ID, metadata, Commissioned Status, Commissioned Before, Decommissioned After, and ordering filters. The two timestamps must be ISO 8601 with seconds and an explicit UTC offset or Z, and are normalized to UTC. Device Group Get accepts a manual ID or a searchable selection. This resource is strictly read-only: the GetOnDemand and SetOnDemand endpoints are not supported.

Data Set List returns the data sets available to your application, with optional name and ordering filters; Data Set Get accepts a manual ID or a searchable selection. This resource is strictly read-only: create, update, and delete are not supported.

Event Hub List returns the event hubs configured for your application, with optional name and ordering filters; Event Hub Get accepts a manual ID or a searchable selection. This resource is strictly read-only (the PATCH endpoint is not supported). Because the response schema was not available when this was built, any field whose name looks like a credential (connection string, key, secret, token, password, SAS) is returned as `[REDACTED]`; see [REST operations](docs/operations.md).

## Credentials

Create a **BDP Community OAuth2 API** credential with the tenant ID, client ID, client secret, and scope provided by your BDP administrator, then choose the UAT or Production environment. See [Credentials](docs/credentials.md).

## Compatibility

- Self-hosted n8n only, tested against n8n **2.44.4**. Not eligible for n8n Cloud because of the `graphql` runtime dependency.
- Node.js 22 or later.

## Usage

Sample workflows for scheduled point history, building history, and GraphQL paging are in [`examples/`](examples/).

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
- [Report an issue](https://github.com/fboucher/n8n-nodes-bdp/issues)

## License

[MIT](LICENSE.md)
