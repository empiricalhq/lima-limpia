# Assignments and locations

A route assignment pairs a route, a truck, and a driver. Its `status` is one of
`scheduled`, `active`, `completed`, and `cancelled`.

## Lifecycle

| Transition              | Who                 | Route                                       |
| ----------------------- | ------------------- | ------------------------------------------- |
| created as `scheduled`  | staff               | `POST /api/admin/assignments`               |
| `scheduled` to `active` | the assigned driver | `POST /api/driver/assignments/:id/start`    |
| `active` to `completed` | the assigned driver | `POST /api/driver/assignments/:id/complete` |

Each move is one `UPDATE` that names the expected current status, the driver,
and the organization
([`assignments/queries.ts`](../apps/api/src/internal/domains/assignments/queries.ts)).
A request from another driver or another municipality, or for an assignment in a
different state, matches no row and answers `404`. A state cannot be skipped or
repeated.

Nothing moves an assignment to `cancelled`, and no transition leaves
`completed`.

## Recording a location

`POST /api/driver/location` records a location only against the driver's
`active` assignment. With none, nothing is written.

[`LocationRepository.recordDriverLocation`](../apps/api/src/internal/domains/locations/repository.ts)
reads the active assignment with `FOR SHARE`, and writes the current location
and the history row in the same transaction. The lock lasts until the
transaction commits. A completion needs a conflicting row lock, so it waits for
the location write and cannot interleave with it. A location is never recorded
against an assignment that has already completed.

Filing a driver issue takes no lock. An issue describes something the driver saw
during the route, so one filed as the route completes still belongs to that
assignment.

## Freshness

Consumers treat a truck location as live only while its assignment is `active`.

- `GET /api/citizen/truck/status` returns the nearest truck within 1 km whose
  assignment is `active` and whose location was updated in the last ten minutes.
- The citizen app polls trucks and status every five minutes, and only while the
  app is in the foreground (`POLLING` in
  [`constants.ts`](../apps/citizen/src/constants.ts)).
- The web API client asks for live responses by default. It opts into a
  60-second cache only for the driver, supervisor, and route lists
  ([`api.ts`](../apps/web/src/lib/api.ts)).
