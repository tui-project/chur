# Implementation plan

Build Radarr support first, then Sonarr. [Product scope](../README.md) and [integration findings](arr-source-investigation.md) define the boundaries.

## Milestones

| Milestone | Deliverable and acceptance criteria |
| --- | --- |
| M0 · Integration probe | **Enough verified to proceed:** independent discovery, bridge cache, explicit grab, initial import, and higher-quality replacement. Remaining compatibility limits stay documented. |
| M1 · Foundation — implemented | Nuxt application, SQLite migrations, persistent worker, authentication, credential handling, and CI. Jobs survive restart, claims are atomic, and backup/restore works. |
| M2 · Read-only library | Synchronise Radarr movies, monitoring, profiles, files, queue, and history. Reconcile changes periodically and make stale state visible. |
| M3 · Discovery | Direct Prowlarr search/RSS, scheduled and new-indexer scans, autobrr intake, deduplication, and tracker enrichment. Persist intake before acknowledgement and enforce request budgets. |
| M4 · Policies and dry-run | Requirements, ordered preferences, repair/edition handling, upgrade conditions, title overrides, and TRaSH-derived presets. The simulator and automation share the same deterministic engine and explanations. |
| M5 · Approval and handover | Candidate-specific approval, persistent dismissals, settings preview/snapshot, exclusive Arr handover, drift detection, and restore. Interrupted handover cannot enable downloads prematurely. |
| M6 · Execution | Integrate the bridge with durable jobs. Recheck decisions before submission, prevent duplicates, reconcile uncertain outcomes, and confirm imports. Unsupported import paths remain visible rather than silently forced. |
| M7 · Docker release | Production image, Compose example, health checks, migrations, backups, setup documentation, and a tested compatibility matrix. Installation and upgrades preserve state. |
| M8 · Sonarr | Episode mappings, numbering schemes, pack coverage, and overlapping/multi-episode files. A replacement must preserve every affected episode. |

## Implementation rules

- Keep policy evaluation and adapters independent of Nuxt request handling.
- Store media identity, source observations, evidence, policy revisions, approvals, jobs, and execution outcomes separately.
- Complete selection and approval before downloading. Required unknown evidence means defer, reject, or permitted explicit review—not a speculative download.
- Use short SQLite transactions; never hold one during a network call. Keep the database on local storage.
- Deduplicate by source identity/hash, not title. Coalesce enrichment requests and budget direct tracker traffic separately from Prowlarr calls.
- Revalidate stale approvals. Rediscovery alone does not revive dismissed suggestions.
- Record submission intent before calling Arr. Reconcile timeouts and restarts before retrying.
- Preserve profiles and Custom Formats. Let Arr perform library file operations.
- Keep secrets out of source control and logs. Default to dry-run until handover and automation are explicitly activated.

## Tests

| Layer | Coverage |
| --- | --- |
| Policy | Identity, evidence uncertainty, qualities, repairs, editions, precedence, approvals, and stopping rules. |
| Adapters | API contracts, malformed data, version differences, rate limits, and timeouts. |
| Database/worker | Migrations, atomic claims, duplicate intake, stale approvals, interrupted work, and recovery. |
| Browser | Setup, policy editing, comparisons, approval/dismissal, and handover status. |
| Service acceptance | Actual Arr grabs/imports, Prowlarr synchronisation, autobrr delivery, and restart behaviour. |

Run fast tests, type checks, and builds in CI. Run supported-service acceptance checks for integration changes and releases. Use sanitised regression fixtures.

## Next work package

Implement **M2**, keeping download automation disabled: connection setup and read-only Radarr synchronisation. M1 uses Nuxt, Node’s built-in SQLite driver, prepared SQL migrations, Zod validation, native Vue forms, Vitest, and Playwright. The production bridge adapter follows the [documented integration contract](arr-source-investigation.md); the disposable probe and its credentials were removed.

Policy cutoff semantics, meaningful-improvement rules, and the first production tracker adapters remain to be finalised at their relevant milestones. Same-quality and lower-ranked import overrides do not block the foundation work.
