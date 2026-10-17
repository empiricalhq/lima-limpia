# Contributing

Read [the architecture](ARCHITECTURE.md) before changing the API or database.
Write code, identifiers, and code comments in English. Write user-facing copy in
Spanish. [AGENTS.md](AGENTS.md) lists the rules a change must follow.

## Setup

Follow [Setup](docs/setup.md). The checks need [mise](https://mise.jdx.dev).
They run on a host with no database.

## Checks

Run these from the repository root before opening a pull request:

```sh
mise run install
mise run check
```

`mise run fix` applies safe formatting and lint fixes. `mise run lint`,
`mise run typecheck`, `mise run test`, and `mise run build` run each part of the
check separately. Biome checks the code, oxfmt checks Markdown, YAML, and JSON,
and oxlint checks React, including the React Compiler rules in the citizen app.

Notebooks in `datasets` have their own check:

```sh
cd datasets && mise run fix
```

[`mise.toml`](mise.toml) defines `mise run check`, which runs the same checks as
CI: format, lint, typecheck, the API and web builds, and the API, database, and
web tests. The tests bring their own database, as
[Setup](docs/setup.md#run-the-tests) describes.

## Documentation

Markdown is wrapped at 80 columns. Format it with the repository fix task:

```sh
mise run fix
```

## Pull requests

Describe the behavior that changed and the checks you ran. If a change alters an
endpoint, schema, environment variable, or user-facing flow, update the matching
documentation in the same change.
