# Changelog

## 0.2.0 (2026-11-27)

### Added

- Write operations through the BDP REST API, built on a shared write foundation (transport, JSON Patch builder and write allowlist).
- Update measurement values, one at a time or in batches.
- Create, update and delete datasets, and update event hubs.
- Run on-demand read and write commands on device groups and sources.
- Send telemetry through the BDP Ingress API, with a new BDP Ingress API credential.

### Changed

- Partial write (206) error messages are sanitized before being shown.
- "Data Set" is now "Dataset" throughout the node UI and documentation.
- Documentation links point to the BDP API specs.
- `@n8n/node-cli` upgraded to 1.4.0. Development tooling now requires Node 24.

## 0.1.0 (2026-11-14)

- First beta release with read operations for the EcoStruxure Building Data Platform.
