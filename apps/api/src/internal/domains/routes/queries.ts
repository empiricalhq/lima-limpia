import { tenantQuery } from '@/internal/shared/tenancy/tenant-query';
import { distanceKmSql } from '../locations/distance';

export const RouteQueries = {
  // Ties on distance go to the lower organization id so a report always lands on the same municipality.
  findNearestActiveOrganization: tenantQuery(`
    SELECT candidate.organization_id
    FROM (
      SELECT r.organization_id, ${distanceKmSql('$1', '$2', 'r.start_lat', 'r.start_lng')} AS distance_km
      FROM route r
      WHERE r.status = 'active' AND {{scope:r}}
      UNION ALL
      SELECT rw.organization_id, ${distanceKmSql('$1', '$2', 'rw.lat', 'rw.lng')} AS distance_km
      FROM route_waypoint rw
      JOIN route r ON r.id = rw.route_id
      WHERE r.status = 'active' AND {{scope:r}}
    ) candidate
    WHERE candidate.distance_km <= $3
    ORDER BY candidate.distance_km ASC, candidate.organization_id ASC
    LIMIT 1
  `),
  findAllActiveWithDetails: tenantQuery(`
    SELECT
      r.*,
      u.name as created_by_name,
      COUNT(rw.id) as waypoint_count
    FROM route r
    LEFT JOIN "user" u ON r.created_by = u.id
    LEFT JOIN route_waypoint rw ON r.id = rw.route_id
    WHERE r.status = 'active' AND {{scope:r}}
    GROUP BY r.id, u.name
    ORDER BY r.created_at DESC
  `),
  exists: tenantQuery('SELECT r.id FROM route r WHERE r.id = $1 AND {{scope:r}}'),
  create: tenantQuery(`
    INSERT INTO route (id, organization_id, name, description, start_lat, start_lng, estimated_duration_minutes, created_by)
    VALUES (gen_random_uuid(), {{organization_id}}, $1, $2, $3, $4, $5, $6)
    RETURNING *
  `),
  findWaypointsByRouteId: tenantQuery(`
    SELECT rw.* FROM route_waypoint rw
    WHERE rw.route_id = $1 AND {{scope:rw}}
    ORDER BY rw.sequence_order ASC
  `),
  createWaypoints: tenantQuery(`
    INSERT INTO route_waypoint (id, organization_id, route_id, sequence_order, lat, lng, estimated_arrival_offset_minutes)
    SELECT gen_random_uuid(), {{organization_id}}, $1, seq, lat, lng, offset_minutes
    FROM UNNEST($2::int[], $3::double precision[], $4::double precision[], $5::int[])
      AS w(seq, lat, lng, offset_minutes)
  `),
} as const;
