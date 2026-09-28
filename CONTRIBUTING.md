# Contributing

Read [the architecture notes](ARCHITECTURE.md) before changing the API or
database. Keep code, identifiers, and code comments in English. Keep user-facing
copy in Spanish.

## Setup

From the repository root:

```sh
cp .env.example .env
bun install
bun --filter @lima-garbage/database db:push
bun --filter @lima-garbage/database setup:municipality
```

Run the seed script only against a development database:

```sh
bun --filter @lima-garbage/database db:seed
```

## Checks

Run the workspace checks before opening a pull request:

```sh
bun run format
bun run format:check
bun run lint
bun --filter @lima-garbage/api test
cd datasets && mise run fix
```

The root `lint` script runs Biome across the workspace and ESLint for the
citizen app. Each package also exposes a small `lint` script for targeted checks
while working in that package.

API tests start a server and clear every table in the database. Copy
`.env.test.example` to `.env.test` and use a database created for tests. Never
point it at a development or production database.

## Pull requests

Describe the behavior that changed and the checks you ran. If a change alters an
endpoint, schema, environment variable, or user-facing flow, update the matching
documentation in the same change.
