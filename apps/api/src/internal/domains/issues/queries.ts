import { tenantQuery } from '@/internal/shared/tenancy/tenant-query';

export const IssueQueries = {
  createCitizenIssue: tenantQuery(`
    INSERT INTO citizen_issue_report (id, organization_id, user_id, type, description, photo_url, lat, lng)
    VALUES (gen_random_uuid(), {{organization_id}}, $1, $2, $3, $4, $5, $6)
    RETURNING id
  `),
  findCitizenIssuesByUserId: tenantQuery(`
    SELECT c.* FROM citizen_issue_report c
    WHERE c.user_id = $1 AND {{scope:c}}
    ORDER BY c.created_at DESC
  `),
  createDriverIssue: tenantQuery(`
    INSERT INTO driver_issue_report (id, organization_id, driver_id, route_assignment_id, type, notes, lat, lng)
    VALUES (gen_random_uuid(), {{organization_id}}, $1, $2, $3, $4, $5, $6)
    RETURNING id
  `),
  findAllOpen: tenantQuery(`
    (
      SELECT 'driver' as source, d.id, d.type, d.status, d.created_at, d.notes as description, d.lat, d.lng
      FROM driver_issue_report d
      WHERE d.status = 'open' AND {{scope:d}}
    )
    UNION ALL
    (
      SELECT 'citizen' as source, c.id, c.type, c.status, c.created_at, c.description, c.lat, c.lng
      FROM citizen_issue_report c
      WHERE c.status = 'open' AND {{scope:c}}
    )
    ORDER BY created_at DESC
    LIMIT 200
  `),
} as const;
