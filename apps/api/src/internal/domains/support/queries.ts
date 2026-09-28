export const SupportQueries = {
  findOrganizations: `
    SELECT id, name, slug, "createdAt"
    FROM organization
    ORDER BY name
  `,
  findOrganization: `
    SELECT id, name, slug, "createdAt"
    FROM organization
    WHERE id = $1
  `,
  findUser: `
    SELECT id, role, COALESCE(banned, false) AS banned
    FROM "user"
    WHERE id = $1
  `,
  findMembershipOrganizationIds: `
    SELECT "organizationId" AS id
    FROM member
    WHERE "userId" = $1
  `,
  findCitizensByEmail: `
    SELECT u.id, u.name, u.email, u."createdAt"
    FROM "user" u
    WHERE u.email = lower($1)
      AND u.role <> $2
      AND NOT EXISTS (SELECT 1 FROM member m WHERE m."userId" = u.id)
  `,
  isSupportUser: `
    SELECT 1 FROM "user" WHERE id = $1 AND role = $2
  `,
  findImpersonationStart: `
    SELECT organization_id AS "organizationId"
    FROM support_audit
    WHERE session_id = $1 AND action = 'impersonation.start'
  `,
  setSessionOrganization: `
    UPDATE session SET "activeOrganizationId" = $2 WHERE id = $1
  `,
  deleteSession: `
    DELETE FROM session WHERE id = $1
  `,
  insertAudit: `
    INSERT INTO support_audit
      (action, impersonator_id, impersonated_user_id, organization_id, session_id, method, path)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
  `,
  recordAuditStatus: `
    UPDATE support_audit SET status_code = $2 WHERE id = $1
  `,
} as const;
