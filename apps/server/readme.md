# Mock server

This workspace runs a `json-server` mock for UI experiments. It serves
[`db.json`](db.json) with sample trucks, collections, reports, and quiz
questions on port `8000` and applies the routes in [`routes.json`](routes.json).

Run it from the repository root:

```sh
bun --filter @lima-garbage/server api
```
