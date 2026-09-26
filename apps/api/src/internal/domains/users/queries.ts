export const UserQueries = {
  findOrganizationMember: `
    SELECT u.id, u.name, u.email, u."createdAt", m.role
    FROM member m
    JOIN "user" u ON u.id = m."userId"
    WHERE m."userId" = $1 AND m."organizationId" = $2
  `,
  findOrganizationMembersByRole: `
    SELECT u.id, u.name, u.email, u."createdAt", m.role
    FROM member m
    JOIN "user" u ON u.id = m."userId"
    WHERE m."organizationId" = $1 AND m.role = $2
    ORDER BY u.name
  `,
  updateProfile: `
    UPDATE "user" SET name = $2, email = $3, "updatedAt" = NOW()
    WHERE id = $1
  `,
  updateCredentialPassword: `
    UPDATE account SET password = $2, "updatedAt" = NOW()
    WHERE "userId" = $1 AND "providerId" = 'credential'
  `,
  deleteSessions: `
    DELETE FROM session WHERE "userId" = $1
  `,
} as const;
