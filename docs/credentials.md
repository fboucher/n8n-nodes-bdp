# Credentials

The node authenticates to Schneider Electric EcoStruxure **Building Data Platform (BDP)** with a **BDP Community OAuth2 API** credential, shared by the REST and GraphQL operations. The Telemetry **Send** operation uses a second, separate credential, [BDP Telemetry Ingress API](#bdp-telemetry-ingress-api).

## Setup

1. In n8n, create a **BDP Community OAuth2 API** credential.
2. Enter the tenant ID, client ID, client secret, and application scope provided by your BDP administrator.
3. Select the **UAT** or **Production** environment explicitly.

n8n's OAuth2 client-credentials support obtains and refreshes access tokens. Do not paste bearer tokens into workflow parameters.

## Credential test

The credential test sends a read-only request to list at most one building. An empty successful response is a valid credential with no accessible buildings; authentication failures and access-denied responses are surfaced separately.

The API contract declares bearer authentication and does not require the optional subscription-key scheme. Confirm environment-specific access with your BDP administrator. A successful credential test does not establish GraphQL permission; see [GraphQL](graphql.md).

## BDP Telemetry Ingress API

Telemetry **Send** talks to the Telemetry Ingress API (an Azure IoT Hub endpoint), which has its own hosts, authentication, and payload format. It does not use the OAuth2 credential, and the other operations do not use this one.

1. In the BDP Portal, open **Data Sources**, select your company and the data source, then **Connections**, and note the **Device ID** (it is case-sensitive) and the **Primary Connection String**.
2. Generate a **SAS token** from the connection string and policy (for example with the Python snippet in the Telemetry Ingress API guide). It looks like `SharedAccessSignature sr=...&sig=...&se=...&skn=...`. Tokens expire, so use a lifetime that suits your workflow and replace the token when it expires.
3. In n8n, create a **BDP Telemetry Ingress API** credential: choose **UAT** or **Production**, enter the **Device ID**, and paste the whole **SAS token**, including the `SharedAccessSignature ` prefix. The token is stored as a password field.

The hosts (`Graph-BdpDif-UAT.azure-devices.net` and `Graph-BdpDif.azure-devices.net`) and the `api-version` are fixed in the node; the credential cannot point the node at any other host. The Device ID in the credential must match the one inside the token exactly, or the hub answers `401 Unauthorized`.

**Credential test.** The only ingress endpoint accepts telemetry, so the node does not call it to test the credential. The test checks, without sending anything, that an environment and Device ID are set and that the token has the right prefix and has not expired. The hub verifies the signature on the first Send; an expired or invalid token is reported there with a clear message that never includes the token. Generating the token from the key and policy inside n8n is not supported; paste a ready-made token.

## Upgrading

After updating this package, restart n8n to reload the compiled credential definition. Existing credentials do not need to be recreated or resaved for the token-URL expression fix: n8n applies the current hidden default when resolving credentials.

## Docker

For Docker development, use the [included Compose setup](docker-compose.md), which mounts both the compiled node and its declared GraphQL parser dependency. If adapting an existing Compose setup, preserve existing `NODE_PATH` entries using the container's `:` separator and recreate the container after changing mounts.
