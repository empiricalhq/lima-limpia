import { tenantQuery } from '@/internal/shared/tenancy/tenant-query';

export const AssignmentQueries = {
  // The composite foreign keys reject a route, truck or driver from another organization.
  create: tenantQuery(`
    INSERT INTO route_assignment (id, organization_id, route_id, truck_id, driver_id, assigned_date, scheduled_start_time, scheduled_end_time, notes, assigned_by)
    VALUES (gen_random_uuid(), {{organization_id}}, $1, $2, $3, CURRENT_DATE, $4, $5, $6, $7)
    RETURNING *
  `),
  findCurrentByDriverId: tenantQuery(`
    SELECT ra.*, r.name as route_name, r.description as route_description, r.start_lat, r.start_lng, t.name as truck_name, t.license_plate
    FROM route_assignment ra
    JOIN route r ON ra.route_id = r.id
    JOIN truck t ON ra.truck_id = t.id
    WHERE ra.driver_id = $1 AND ra.status IN ('scheduled', 'active') AND {{scope:ra}}
    ORDER BY ra.scheduled_start_time ASC
    LIMIT 1
  `),
  start: tenantQuery(`
    UPDATE route_assignment ra
    SET status = 'active', actual_start_time = NOW()
    WHERE ra.id = $1 AND ra.driver_id = $2 AND ra.status = 'scheduled' AND {{scope:ra}}
    RETURNING ra.id
  `),
  complete: tenantQuery(`
    UPDATE route_assignment ra
    SET status = 'completed', actual_end_time = NOW()
    WHERE ra.id = $1 AND ra.driver_id = $2 AND ra.status = 'active' AND {{scope:ra}}
    RETURNING ra.id
  `),
  findActiveByDriverId: tenantQuery(`
    SELECT ra.id, ra.truck_id FROM route_assignment ra
    WHERE ra.driver_id = $1 AND ra.status = 'active' AND {{scope:ra}}
    LIMIT 1
  `),
} as const;
