import { PlatformRoles } from '@lima-garbage/database';
import { APIError } from 'better-auth/api';
import { BaseService } from '@/internal/shared/services/base-service';
import { type OrganizationScope, organizationScope, unassignedScope } from '@/internal/shared/tenancy/scope';
import { ForbiddenError, NotFoundError, ValidationError } from '@/internal/shared/utils/errors';
import { HttpStatus } from '@/internal/shared/utils/http-status';
import type { AuthService } from '../auth/service';
import type { AuthSession } from '../auth/types';
import type { IssueReportSummary } from '../issues/models';
import type { IssueRepository } from '../issues/repository';
import type { Citizen, Organization } from './models';
import type { SupportRepository } from './repository';

interface SupportServiceDependencies {
  supportRepo: SupportRepository;
  issueRepo: IssueRepository;
  authService: AuthService;
}

/** Headers the caller must forward: the cookies that switch the browser to another session. */
interface SessionSwitch {
  headers: Headers;
}

export class SupportService extends BaseService {
  private readonly supportRepo: SupportRepository;
  private readonly issueRepo: IssueRepository;
  private readonly authService: AuthService;

  constructor({ supportRepo, issueRepo, authService }: SupportServiceDependencies) {
    super();
    this.supportRepo = supportRepo;
    this.issueRepo = issueRepo;
    this.authService = authService;
  }

  listOrganizations(): Promise<Organization[]> {
    return this.supportRepo.findOrganizations();
  }

  /** The scope for reading one municipality, refused when there is no such municipality. */
  async scopeOf(organizationId: string): Promise<OrganizationScope> {
    if (!(await this.supportRepo.findOrganization(organizationId))) {
      throw new NotFoundError('Organization not found');
    }
    return organizationScope(organizationId);
  }

  /** Reports no municipality owns, which no municipality's staff can see. */
  getUnassignedIssues(): Promise<IssueReportSummary[]> {
    return this.issueRepo.findAllOpen(unassignedScope);
  }

  findCitizensByEmail(email: string): Promise<Citizen[]> {
    return this.supportRepo.findCitizensByEmail(email);
  }

  /**
   * Start an impersonated session as `userId`. The session opens in one municipality, the user's
   * only one or the one named, so the staff middlewares scope it as they scope the user. A start
   * that cannot be recorded leaves no session behind.
   */
  async impersonate(
    headers: Headers,
    impersonatorId: string,
    userId: string,
    requestedOrganizationId: string | undefined,
  ): Promise<SessionSwitch> {
    const target = await this.supportRepo.findImpersonationTarget(userId);
    if (!target) {
      throw new NotFoundError('User not found');
    }
    if (target.role === PlatformRoles.SUPPORT) {
      throw new ForbiddenError('A support user cannot be impersonated');
    }
    if (target.banned) {
      throw new ForbiddenError('A banned user cannot be impersonated');
    }
    const organizationId = await this.chooseOrganization(userId, requestedOrganizationId);

    const { headers: responseHeaders, response } = await this.startSession(headers, userId);
    const sessionId = response.session.id;
    try {
      await this.supportRepo.startImpersonation({
        action: 'impersonation.start',
        impersonatorId,
        impersonatedUserId: userId,
        organizationId,
        sessionId,
      });
    } catch (error) {
      await this.supportRepo.deleteSession(sessionId);
      throw error;
    }
    return { headers: responseHeaders };
  }

  /**
   * End the impersonated session `session` and return the support session that started it. The
   * audit row is written first, so a session is never ended without a record. Better Auth ends the
   * session on its own connection, so the two cannot share a transaction; a stop whose session end
   * fails leaves its row without a status.
   */
  async stopImpersonating(headers: Headers, session: AuthSession, impersonatedUserId: string): Promise<SessionSwitch> {
    const impersonatorId = session.impersonatedBy;
    if (!impersonatorId) {
      throw new ForbiddenError('This session is not impersonated');
    }
    const auditId = await this.supportRepo.insertAudit({
      action: 'impersonation.stop',
      impersonatorId,
      impersonatedUserId,
      organizationId: session.activeOrganizationId ?? null,
      sessionId: session.id,
    });
    const { headers: responseHeaders } = await this.stopSession(headers);
    await this.supportRepo.recordStatus(auditId, HttpStatus.OK);
    return { headers: responseHeaders };
  }

  private async chooseOrganization(userId: string, requested: string | undefined): Promise<string | null> {
    const memberships = await this.supportRepo.findMembershipOrganizationIds(userId);
    if (requested) {
      if (!memberships.includes(requested)) {
        throw new ValidationError('The user is not a member of that organization');
      }
      return requested;
    }
    if (memberships.length > 1) {
      throw new ValidationError('The user belongs to several organizations; name one with organizationId');
    }
    return memberships[0] ?? null;
  }

  private async startSession(headers: Headers, userId: string) {
    try {
      return await this.authService.api.impersonateUser({ headers, body: { userId }, returnHeaders: true });
    } catch (error) {
      this.throwAuthApiError(error);
    }
  }

  private async stopSession(headers: Headers) {
    try {
      return await this.authService.api.stopImpersonating({ headers, returnHeaders: true });
    } catch (error) {
      this.throwAuthApiError(error);
    }
  }

  private throwAuthApiError(error: unknown): never {
    if (error instanceof APIError) {
      if (error.statusCode === HttpStatus.FORBIDDEN) {
        throw new ForbiddenError(error.message);
      }
      if (error.statusCode === HttpStatus.NOT_FOUND) {
        throw new NotFoundError(error.message);
      }
      if (error.statusCode === HttpStatus.BAD_REQUEST) {
        throw new ValidationError(error.message);
      }
    }
    throw error;
  }
}
