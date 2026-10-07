# Contributing

Read [the architecture](ARCHITECTURE.md) before changing the API or database.
Write code, identifiers, and code comments in English. Write user-facing copy in
Spanish. [AGENTS.md](AGENTS.md) lists the rules a change must follow.

## Setup

Follow [Setup](docs/setup.md). The checks need [mise](https://mise.jdx.dev) and
a PostgreSQL database that is safe to wipe. Setup shows how to start one with
Docker.

## Checks

Run these from the repository root before opening a pull request:

```sh
bun run format
mise run check
```

`bun run lint` runs `biome lint . && oxlint` across the workspace. Biome checks
the code and `oxlint` checks React, including the React Compiler rules in the
citizen app. Each workspace also has a `lint` script that runs Biome alone for
targeted checks.

Notebooks in `datasets` have their own check:

```sh
cd datasets && mise run fix
```

[`mise.toml`](mise.toml) defines `mise run check`, which runs the same checks as
CI: format, lint, typecheck, the web build, and the API and database tests. The
test task needs `DATABASE_URL` to point at a PostgreSQL database and clears
every table in it, as [Setup](docs/setup.md#run-the-tests) describes. Each check
also runs alone: `mise run check:format`, `check:lint`, `check:typecheck`,
`check:web-build` and `check:test`.

## Documentation

Markdown is wrapped at 80 columns. Format it with Prettier:

```sh
bunx prettier --print-width 80 --prose-wrap always --write '*.md' 'docs/*.md' 'apps/*/readme.md' 'packages/*/readme.md' 'datasets/readme.md'
```

## Pull requests

Describe the behavior that changed and the checks you ran. If a change alters an
endpoint, schema, environment variable, or user-facing flow, update the matching
documentation in the same change.
