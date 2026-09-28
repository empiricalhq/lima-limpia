import { tenantQuery } from '@/internal/shared/tenancy/tenant-query';

export const TruckQueries = {
  findAllActiveWithDetails: tenantQuery(`
    SELECT
      t.*,
      tcl.lat,
      tcl.lng,
      tcl.updated_at as location_updated_at,
      u.name as driver_name,
      ra.status as assignment_status
    FROM truck t
    LEFT JOIN truck_current_location tcl ON t.id = tcl.truck_id
    LEFT JOIN route_assignment ra ON t.id = ra.truck_id AND ra.status IN ('scheduled', 'active')
    LEFT JOIN "user" u ON ra.driver_id = u.id
    WHERE t.is_active = true AND {{scope:t}}
    ORDER BY t.created_at DESC
  `),
  // Drivers are staff of one municipality; citizens never see who drives.
  findAllActiveForCitizens: tenantQuery(`
    SELECT
      t.id,
      t.name,
      t.license_plate,
      t.is_active,
      t.created_at,
      tcl.lat,
      tcl.lng,
      tcl.updated_at as location_updated_at,
      ra.status as assignment_status
    FROM truck t
    LEFT JOIN truck_current_location tcl ON t.id = tcl.truck_id
    LEFT JOIN route_assignment ra ON t.id = ra.truck_id AND ra.status IN ('scheduled', 'active')
    WHERE t.is_active = true AND {{scope:t}}
    ORDER BY t.created_at DESC
  `),
  create: tenantQuery(`
    INSERT INTO truck (id, organization_id, name, license_plate)
    VALUES (gen_random_uuid(), {{organization_id}}, $1, $2)
    RETURNING id, name, license_plate, is_active, created_at
  `),
  deactivate: tenantQuery('UPDATE truck t SET is_active = false WHERE t.id = $1 AND {{scope:t}} RETURNING t.id'),
} as const;
