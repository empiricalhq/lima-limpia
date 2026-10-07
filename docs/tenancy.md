# Tenancy

One organization is one municipality. Several run on one deployment, and each is
isolated from the others.

## Who decides what

| Fact                                     | Stored in                      | Changed by                                                                       |
| ---------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| A municipality                           | `organization` row             | The operator, with `setup:municipality`. No HTTP route creates one.              |
| A staff member's role in a municipality  | `member.role`                  | An owner or admin, or a supervisor for drivers, through `POST /api/admin/users`. |
| The municipality a session works in      | `session.activeOrganizationId` | The user, through `organization/set-active`, among their own memberships.        |
| The municipality a domain row belongs to | `organization_id` on the row   | The API, from the caller's scope. No request body carries it.                    |

A role name never grants access to another municipality's data. Owning one
organization authorizes only that organization. No staff account reads more than
one municipality.

## Tables

These tables carry a required `organization_id`: `truck`, `route`,
`route_waypoint`, `route_schedule`, `route_assignment`, `driver_issue_report`,
`system_alert`, `dispatch_message`, `truck_current_location`, and
`truck_location_history`.

Where a row references another tenant row, the foreign key includes
`organization_id`, so the database rejects a row that mixes two municipalities.
The references are an assignment's route, truck, and driver; a location's or an
alert's assignment; and an alert's truck. An assignment or truck that an alert
or a current location references cannot be deleted. The API deactivates trucks
instead.

`citizen_issue_report.organization_id` is nullable. `NULL` means no municipality
is in reach of the report.

## Scope in code

A staff request carries an `OrganizationScope` of its active organization. The
scope types are in
[`scope.ts`](../apps/api/src/internal/shared/tenancy/scope.ts):

| Scope               | Reads | Writes |
| ------------------- | ----- | ------ |
| `OrganizationScope` | yes   | yes    |
| `UnassignedScope`   | yes   | yes    |
| `allOrganizations`  | yes   | no     |

Every repository method on a tenant table takes a scope as its first argument.
Repositories extend
[`TenantRepository`](../apps/api/src/internal/shared/tenancy/tenant-repository.ts),
which has no raw query method. A query is built with `tenantQuery`, which
refuses SQL that has no `{{scope:alias}}` or `{{organization_id}}` marker. At
execution the marker becomes `alias.organization_id = $n`.

The lint rule
[`no-service-database-access.grit`](../biome-plugins/no-service-database-access.grit)
rejects `db.query` in services and handlers, so SQL goes through repositories.

A row outside the caller's scope reads as missing: `404` for one resource, an
empty list for a collection.

## Citizens

Citizens are global. A citizen has no membership and keeps one account when they
move. Citizen routes use the `allOrganizations` scope to show the active trucks
and live locations of every municipality.

A citizen report goes to the municipality of the nearest active route, measured
from its start or any waypoint, within 5 km of the report's coordinates
(`REPORT_ROUTING_RADIUS_KM` in
[`citizen/service.ts`](../apps/api/src/internal/domains/citizen/service.ts)).
With none in reach the report stays unassigned, and only its author lists it.

## Applying migration 0007

[`0007_organization_tenancy`](../packages/database/migrations/0007_organization_tenancy.sql)
assigns existing rows to the only organization. It aborts and changes nothing
when rows exist and the database holds any number of organizations other than
one. An empty database applies it with any number.
