# Development

Requires Node **24.15+ within v24, or v26+** and pnpm 12.14.0. No media-service credentials are needed for the foundation.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Open the printed local URL. In another terminal, run `pnpm setup:token` and use that token to create the administrator account. The setup token is generated automatically and stored privately in `CHUR_DATA_DIR/setup.token`. There is no default password. Use `CHUR_SECURE_COOKIES=true` with HTTPS.

## Foundation

- Nuxt serves the UI and API. Server services live in `server/services` and are independent of Nuxt.
- Startup initialises SQLite and completes migrations before creating services or starting workers. Services import repositories in `server/repositories` directly; repositories access the shared connection when called. Shutdown stops the worker before closing SQLite. Repositories own SQL, transactions, migrations and SQLite snapshots; services handle authentication, encryption and task execution.
- Node's built-in `node:sqlite` provides prepared queries and transactional, checksummed migrations. No ORM or additional database service is required.
- SQLite uses WAL and short write transactions. `CHUR_DATA_DIR` defaults to `data/` relative to the working directory. Docker will use `/app` as its working directory and mount persistent storage at `/app/data`. Keep it on local persistent storage.
- Passwords use scrypt; sessions are revocable, HttpOnly cookies. Credential values are encrypted with a private local master key.
- Jobs use atomic claims, leases, and heartbeats. Expired retry-safe work can resume; uncertain unsafe work goes to review.
- Only a harmless system-check job is available. Service connections, searches, and download automation are not implemented or enabled.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:browser
```

Browser tests need Playwright Chromium (`pnpm exec playwright install chromium`). They start the production build with isolated test data and do not contact media services. CI runs checks on Node 24 and 26. Local validation used Node 26.8.1.

The lockfile pins patched `glob`/`minimatch` overrides. The pnpm audit reports one low-severity transitive advisory in Nuxt’s build chain; there are no moderate, high, or critical findings in the checked dependency tree.

## Backup and restore

The overview's **Create backup** action and `pnpm db:backup` create a snapshot under `CHUR_DATA_DIR/backups/<id>`. Copy the whole snapshot directory, including its master key, to protected backup storage.

```sh
pnpm db:restore --from /path/to/backup --to /path/to/new-data-directory
```

Restore verifies checksums and SQLite integrity and refuses an existing destination. Stop Chur, restore to a new directory, then point `CHUR_DATA_DIR` there and restart. Backups contain sensitive account and credential data; keep them private.

Health endpoints: `/api/health/live` and `/api/health/ready`. Other operational APIs require sign-in. All API writes, including setup and login, require a session-bound CSRF token from `/api/auth/status` in the `X-CSRF-Token` header and its matching HttpOnly cookie. No external URL or forwarded-host configuration is needed.

## GitHub releases

Successful CI on `main` creates a missing version tag from `package.json`, then prepares a draft GitHub release with generated notes. Review the draft before publishing. Dependency updates run weekly; pull request titles such as `feat:`, `fix:` and `docs:` set release-note labels. Docker image publishing will be added with the Docker release milestone.
