# Troubleshooting

- **Authentication failed:** verify the tenant ID, client ID, client secret, and application scope with your Building Data Platform (BDP) administrator.
- **Access denied:** verify that the application has permission to access the selected environment and requested building.
- **No results:** an empty list is valid; check the building selection, filters, access scope, and time window.
- **Selector search fails:** choose a resolved building before searching measurement points, or enter an ID manually. Unresolved expressions are not used to issue unrelated searches.
- **GraphQL validation error:** inspect the returned message/code/location/path and confirm the field, scalar types, and permissions in your environment's explorer. HTTP 200 does not mean a query succeeded.
- **GraphQL invalid envelope/content type:** check the environment's API response and proxy configuration. Batch arrays, multipart incremental responses, HTML, and missing/object-less success data are not accepted.

For Docker-specific issues, see [Docker Compose troubleshooting](docker-compose.md#ports-and-startup-troubleshooting).

BDP access, tenant configuration, and API permissions are the responsibility of your administrator. Report node issues in [the repository](https://github.com/fboucher/n8n-nodes-bdp/issues).
