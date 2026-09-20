import { BaseRepository } from '@/internal/shared/repository/base-repository';
import type { CreateRouteRequest, Route, RouteWaypoint, RouteWithDetails } from './models';
import { RouteQueries } from './queries';

const ETA_MINUTES_PER_SEQUENCE_STEP = 5;

export class RouteRepository extends BaseRepository {
  async findAllActive(): Promise<RouteWithDetails[]> {
    return this.executeQuery<RouteWithDetails>(RouteQueries.findAllActiveWithDetails);
  }

  async create(data: CreateRouteRequest, createdBy: string): Promise<Route> {
    return this.db.withTransaction(async (client) => {
      const { name, description, start_lat, start_lng, estimated_duration_minutes, waypoints } = data;

      const routeResult = await client.query<Route>(RouteQueries.create, [
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

      await client.query(RouteQueries.createWaypoints, [
        route.id,
        waypoints.map((w) => w.sequence_order),
        waypoints.map((w) => w.lat),
        waypoints.map((w) => w.lng),
        waypoints.map((w) => w.sequence_order * ETA_MINUTES_PER_SEQUENCE_STEP),
      ]);

      return route;
    });
  }

  async findWaypointsByRouteId(routeId: string): Promise<RouteWaypoint[]> {
    return this.executeQuery<RouteWaypoint>(RouteQueries.findWaypointsByRouteId, [routeId]);
  }
}
