import type { OrganizationScope, Scope } from '@/internal/shared/tenancy/scope';
import { TenantRepository } from '@/internal/shared/tenancy/tenant-repository';
import type { CreateRouteRequest, Route, RouteWaypoint, RouteWithDetails } from './models';
import { RouteQueries } from './queries';

const ETA_MINUTES_PER_SEQUENCE_STEP = 5;

export class RouteRepository extends TenantRepository {
  async findAllActive(scope: Scope): Promise<RouteWithDetails[]> {
    const { rows } = await this.read<RouteWithDetails>(scope, RouteQueries.findAllActiveWithDetails);
    return rows;
  }

  /** The organization owning the active route nearest to the point, if any lies within the radius. */
  async findNearestActiveOrganizationId(
    scope: Scope,
    point: { lat: number; lng: number },
    radiusKm: number,
  ): Promise<string | null> {
    const row = await this.readOne<{ organization_id: string }>(scope, RouteQueries.findNearestActiveOrganization, [
      point.lat,
      point.lng,
      radiusKm,
    ]);
    return row?.organization_id ?? null;
  }

  async exists(scope: Scope, id: string): Promise<boolean> {
    const { count } = await this.read(scope, RouteQueries.exists, [id]);
    return count > 0;
  }

  async create(scope: OrganizationScope, data: CreateRouteRequest, createdBy: string): Promise<Route> {
    return this.transaction(scope, async (tx) => {
      const { name, description, start_lat, start_lng, estimated_duration_minutes, waypoints } = data;

      const routeResult = await tx.write<Route>(RouteQueries.create, [
        name,
        description,
        start_lat,
        start_lng,
        estimated_duration_minutes,
        createdBy,
      ]);
      const [route] = routeResult.rows;

      if (!route) {
        throw new Error('Database query failed to return created route.');
      }

      await tx.write(RouteQueries.createWaypoints, [
        route.id,
        waypoints.map((w) => w.sequence_order),
        waypoints.map((w) => w.lat),
        waypoints.map((w) => w.lng),
        waypoints.map((w) => w.sequence_order * ETA_MINUTES_PER_SEQUENCE_STEP),
      ]);

      return route;
    });
  }

  async findWaypointsByRouteId(scope: Scope, routeId: string): Promise<RouteWaypoint[]> {
    const { rows } = await this.read<RouteWaypoint>(scope, RouteQueries.findWaypointsByRouteId, [routeId]);
    return rows;
  }
}
