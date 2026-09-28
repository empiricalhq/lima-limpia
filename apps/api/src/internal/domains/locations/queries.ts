import { tenantQuery } from '@/internal/shared/tenancy/tenant-query';
import { distanceKmSql } from './distance';

export const LocationQueries = {
  upsertTruckCurrentLocation: tenantQuery(`
    INSERT INTO truck_current_location (truck_id, organization_id, route_assignment_id, lat, lng, speed, heading, updated_at)
    VALUES ($1, {{organization_id}}, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (truck_id) DO UPDATE SET
      route_assignment_id = EXCLUDED.route_assignment_id,
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      speed = EXCLUDED.speed,
      heading = EXCLUDED.heading,
      updated_at = NOW()
  `),
  createTruckLocationHistory: tenantQuery(`
    INSERT INTO truck_location_history (id, organization_id, truck_id, route_assignment_id, lat, lng, speed, heading)
    VALUES (gen_random_uuid(), {{organization_id}}, $1, $2, $3, $4, $5, $6)
  `),
  findNearbyTrucks: tenantQuery(`
    SELECT truck_id, truck_name, distance_km
    FROM (
      SELECT
        t.id as truck_id,
        t.name as truck_name,
        ${distanceKmSql('$1', '$2', 'tcl.lat', 'tcl.lng')} AS distance_km
      FROM truck_current_location tcl
      JOIN truck t ON tcl.truck_id = t.id
      JOIN route_assignment ra ON tcl.route_assignment_id = ra.id
      WHERE ra.status = 'active' AND tcl.updated_at > NOW() - INTERVAL '10 minutes' AND {{scope:tcl}}
    ) nearby
    WHERE distance_km < 1
    ORDER BY distance_km ASC
    LIMIT 1
  `),
} as const;
