# Lima Limpia

Lima Limpia is a waste-collection system for Peru. It gives municipal teams a
view of routes and trucks, and gives citizens a way to check truck locations and
report collection problems.

This repository is a Bun workspace monorepo. The API owns validation, business
rules, and database writes. The web and mobile apps call the API.

## Get started

You need Bun 1.4 and a PostgreSQL database. Supabase works well for local
development.

1. Copy the environment template and fill in the required values:

   ```sh
   cp .env.example .env
   ```

2. Install dependencies:

   ```sh
   bun install
   ```

3. Create the database schema:

   ```sh
   bun --filter @lima-garbage/database db:push
   ```

4. Create a municipality and its first owner. Run it again for each
   municipality:

   ```sh
   bun --filter @lima-garbage/database setup:municipality
   ```

5. Create an account for the platform support team if needed. Support reads
   every municipality and changes data only by impersonating a user:

   ```sh
   bun --filter @lima-garbage/database setup:support
   ```

6. Add sample trucks, users, a route, and an assignment if needed:

   ```sh
   bun --filter @lima-garbage/database db:seed
   ```

7. Start the API:

   ```sh
   bun --filter @lima-garbage/api dev
   ```

The API listens on `http://localhost:4000` by default. Start the web app in a
second terminal:

```sh
bun --filter @lima-garbage/web dev
```

The web app expects `API_BASE_URL=http://localhost:4000`. See
[`apps/api/readme.md`](apps/api/readme.md) for the endpoint reference.

## Repository layout

| Path                                     | Purpose                                                                                            |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`apps/api`](apps/api)                   | Hono API. It owns authentication, business rules, and database writes.                             |
| [`apps/web`](apps/web)                   | Next.js dashboard for municipal staff. Server actions call the API.                                |
| [`apps/citizen`](apps/citizen)           | Expo app for citizens. It shows trucks, handles reports, and stores the session in secure storage. |
| [`apps/server`](apps/server)             | `json-server` prototype. It is not part of the production data flow.                               |
| [`packages/database`](packages/database) | Drizzle schema, migrations, and database tooling.                                                  |
| [`packages/email`](packages/email)       | React Email templates used by the API.                                                             |
| [`datasets`](datasets)                   | Marimo notebooks for public waste and population datasets.                                         |

The runtime data flow and package boundaries are shown in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

## Development commands

Run these commands from the repository root:

```sh
bun --filter @lima-garbage/api test
bun run format
bun run format:check
bun run lint
bun --filter @lima-garbage/citizens start
bun --filter @lima-garbage/citizens dev
cd datasets && mise run install && mise run dev
```

The citizen app has native dependencies, so Expo Go is not enough. Use an EAS
development build or a local Android build. Its setup is documented in
[`apps/citizen/readme.md`](apps/citizen/readme.md).

## Documentation

- [Architecture](ARCHITECTURE.md)
- [Contributing](CONTRIBUTING.md)
- [API](apps/api/readme.md)
- [Web dashboard](apps/web/readme.md)
- [Prototype server](apps/server/readme.md)
- [Database](packages/database/readme.md)
- [Email package](packages/email/readme.md)
- [Datasets](datasets/readme.md)
- [Comment review guide](notes/comments.md)

## Maintainers

- [David Duran](https://github.com/totallynotdavid)
- [Pedro Rojas F](https://github.com/PedroRojasF)
