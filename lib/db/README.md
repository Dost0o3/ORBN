# `@workspace/db`

Drizzle ORM schema and Postgres client shared by every workspace package
that talks to the database.

## Scripts

| Script              | What it does                                                                 |
| ------------------- | ---------------------------------------------------------------------------- |
| `push`              | `drizzle-kit push` — applies the current schema to `$DATABASE_URL`.          |
| `push-if-changed`   | Same as `push`, but skipped when nothing has changed (see below).            |
| `push-force`        | `drizzle-kit push --force` — for accepting destructive prompts in CI.        |
| `migrate`           | `drizzle-kit migrate` — runs the numbered SQL files in `drizzle/`.           |

## `push-if-changed` — fast-path for test suites

`scripts/push-if-changed.mjs` computes a sha256 over every file under
`src/schema/` plus `drizzle.config.ts` plus the `DATABASE_URL`, and
compares it against the last recorded checksum at:

```
lib/db/node_modules/.cache/drizzle-push-checksum.json
```

- If the checksum matches, the script exits 0 immediately and prints
  `[db push-if-changed] schema unchanged since last push, skipping ...`.
- If the checksum differs (or the cache is missing), it shells out to
  `drizzle-kit push` and, on success, writes the new checksum.

The cache lives inside `node_modules`, so it is automatically discarded
on a fresh `pnpm install`. It is per-`DATABASE_URL`, so switching to a
different database (e.g. a throwaway test DB) correctly forces a push.

### When to use which in test suites

Any package whose test runner needs the live schema should use
`push-if-changed` from its `pretest` hook, **not** `push`:

```jsonc
// artifacts/<pkg>/package.json
{
  "scripts": {
    "pretest":       "pnpm --filter @workspace/db run push-if-changed",
    "pretest:watch": "pnpm --filter @workspace/db run push-if-changed",
    "test":          "vitest run"
  }
}
```

Today only `@workspace/api-server` runs DB-backed tests; other artifacts
(e.g. `@workspace/nexusid`) use jsdom + RTL and do not touch the DB, so
they have no `pretest` hook. If a future package adds DB-backed tests,
copy the snippet above instead of calling `push` directly — that keeps
the local dev loop fast for everyone.

CI / one-shot environments that genuinely want a clean push every time
can still call `pnpm --filter @workspace/db run push` directly.

### Post-merge

`scripts/post-merge.sh` (run automatically after each task merge) also
uses `push-if-changed` rather than `push`, so merges that don't touch
the schema skip the `drizzle-kit push` step entirely via the cached
checksum fast-path.
