import { PlatformRoles } from '@lima-garbage/database';
import { BaseRepository } from '@/internal/shared/repository/base-repository';
import type { AuditEntry, Citizen, ImpersonationTarget, Organization } from './models';
import { SupportQueries } from './queries';

/**
 * Municipality-independent reads for the support role, and the audit trail. It reads the
 * organization, user, member and session tables only, and never a tenant table: municipality data
 * is read through the tenant repositories under an explicit organization scope.
 */
export class SupportRepository extends BaseRepository {
  findOrganizations(): Promise<Organization[]> {
    return this.executeQuery<Organization>(SupportQueries.findOrganizations);
  }

  findOrganization(organizationId: string): Promise<Organization | null> {
    return this.executeQuerySingle<Organization>(SupportQueries.findOrganization, [organizationId]);
  }

  findImpersonationTarget(userId: string): Promise<ImpersonationTarget | null> {
    return this.executeQuerySingle<ImpersonationTarget>(SupportQueries.findUser, [userId]);
  }

  async findMembershipOrganizationIds(userId: string): Promise<string[]> {
    const rows = await this.executeQuery<{ id: string }>(SupportQueries.findMembershipOrganizationIds, [userId]);
    return rows.map((row) => row.id);
  }

  /** Users with no municipality, matched on the exact email. */
  findCitizensByEmail(email: string): Promise<Citizen[]> {
    return this.executeQuery<Citizen>(SupportQueries.findCitizensByEmail, [email, PlatformRoles.SUPPORT]);
  }

  /** Read from the database on every request, so a revoked support user loses access at once. */
  async isSupportUser(userId: string): Promise<boolean> {
    const rows = await this.executeQuery(SupportQueries.isSupportUser, [userId, PlatformRoles.SUPPORT]);
    return rows.length > 0;
  }

  /** The municipality an impersonated session opened in, or null when it has no start row. */
  findImpersonationStart(sessionId: string): Promise<{ organizationId: string | null } | null> {
    return this.executeQuerySingle<{ organizationId: string | null }>(SupportQueries.findImpersonationStart, [
      sessionId,
    ]);
  }

  /** Point the new impersonated session at its municipality and record the start, or do neither. */
  async startImpersonation(entry: AuditEntry): Promise<void> {
    await this.db.withTransaction(async (client) => {
      if (entry.organizationId) {
        await client.query(SupportQueries.setSessionOrganization, [entry.sessionId, entry.organizationId]);
      }
      await client.query(SupportQueries.insertAudit, auditParams(entry));
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.db.query(SupportQueries.deleteSession, [sessionId]);
  }

  /** Returns the row id, so the response status can be recorded once the request has run. */
  async insertAudit(entry: AuditEntry): Promise<string> {
    const rows = await this.executeQuery<{ id: string }>(SupportQueries.insertAudit, auditParams(entry));
    const [row] = rows;
    if (!row) {
      throw new Error('The audit row was not written.');
    }
    return row.id;
  }

  async recordStatus(auditId: string, statusCode: number): Promise<void> {
    await this.db.query(SupportQueries.recordAuditStatus, [auditId, statusCode]);
  }
}

function auditParams(entry: AuditEntry): unknown[] {
  return [
    entry.action,
    entry.impersonatorId,
    entry.impersonatedUserId,
    entry.organizationId,
    entry.sessionId,
    entry.method ?? null,
    entry.path ?? null,
  ];
}
