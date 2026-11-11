# Credentials

The node authenticates to Schneider Electric EcoStruxure **Building Data Platform (BDP)** with a single **BDP Community OAuth2 API** credential, shared by the REST and GraphQL operations.

## Setup

1. In n8n, create a **BDP Community OAuth2 API** credential.
2. Enter the tenant ID, client ID, client secret, and application scope provided by your BDP administrator.
3. Select the **UAT** or **Production** environment explicitly.

n8n's OAuth2 client-credentials support obtains and refreshes access tokens. Do not paste bearer tokens into workflow parameters.

## Credential test

The credential test sends a read-only request to list at most one building. An empty successful response is a valid credential with no accessible buildings; authentication failures and access-denied responses are surfaced separately.

The API contract declares bearer authentication and does not require the optional subscription-key scheme. Confirm environment-specific access with your BDP administrator. A successful credential test does not establish GraphQL permission; see [GraphQL](graphql.md).

## Upgrading

After updating this package, restart n8n to reload the compiled credential definition. Existing credentials do not need to be recreated or resaved for the token-URL expression fix: n8n applies the current hidden default when resolving credentials.

## Docker

For Docker development, use the [included Compose setup](docker-compose.md), which mounts both the compiled node and its declared GraphQL parser dependency. If adapting an existing Compose setup, preserve existing `NODE_PATH` entries using the container's `:` separator and recreate the container after changing mounts.
