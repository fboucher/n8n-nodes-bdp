# Acceptance status

Status of verification for the Building Data Platform (BDP) node as of **2026-11-09**.

## Automated and offline

Automated parser/adapter/node checks and REST regressions use only synthetic fixtures and mocked HTTP. The Docker smoke procedure installs the actual archive (no source mounts or development links), checks discovery of the credential and GraphQL/REST operations and assets, imports the example workflows, and verifies the installed query path with mocked transport.

Offline acceptance passed build/lint and **114 automated tests**, including unchanged REST defaults/outputs and actual n8n expression evaluation. Clean archive installation passed in **n8n 2.44.4 / Node.js 26.10.0**, package **0.1.0**, parser **16.15.0**. Both GraphQL examples imported successfully; the running n8n instance discovered the shared credential, GraphQL Execute Query, and all REST operations (including Building Get).

A Docker-only native OAuth harness also verified acquisition, `expires_in`-derived expiry metadata, token persistence, one 401 client-credentials reacquisition, secret redaction, and failure on a second 401, using a synthetic loopback token server and mocked BDP responses. That version-pinned harness inspects n8n internals only in tests; the shipped integration uses the supported authenticated-request helper exclusively.

## Live UAT

**Live UAT acceptance is pending.** The supplied local reference confirms endpoint/header policy but does not prove live field/scalar availability or GraphQL authorization. The following must be recorded before closing the live-acceptance tickets:

- Nested traversal and named operation selection
- Both live page-variable sets
- Empty results and server validation errors
- A live REST read in the installed Docker environment

Local tests reject writes without sending any to UAT. Do not treat example templates, successful package installation, or mocked outputs as live acceptance. UAT validation and publishing require maintainer-provided UAT access and approved npm/GitHub publishing configuration.
