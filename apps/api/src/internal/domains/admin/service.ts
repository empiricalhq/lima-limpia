import { type AppRole, canManageRole, createStaffUser, toRoleList } from '@lima-garbage/database';
import { APIError } from 'better-auth/api';
import { BaseService } from '@/internal/shared/services/base-service';
import type { OrganizationScope } from '@/internal/shared/tenancy/scope';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/internal/shared/utils/errors';
import { HttpStatus } from '@/internal/shared/utils/http-status';
import type { CreateAssignmentRequest, RouteAssignment } from '../assignments/models';
import type { AssignmentRepository } from '../assignments/repository';
import type { AuthService } from '../auth/service';
import type { CitizenIssueType, IssueReportSummary } from '../issues/models';
import type { IssueRepository } from '../issues/repository';
import type { CreateRouteRequest, Route, RouteWaypoint, RouteWithDetails } from '../routes/models';
import type { RouteRepository } from '../routes/repository';
import type { CreateTruckRequest, Truck, TruckWithDetails } from '../trucks/models';
import type { TruckRepository } from '../trucks/repository';
import type { UserWithRole } from '../users/models';
import type { UserRepository } from '../users/repository';

interface AdminServiceDependencies {
  truckRepo: TruckRepository;
  routeRepo: RouteRepository;
  assignmentRepo: AssignmentRepository;
  issueRepo: IssueRepository;
  userRepo: UserRepository;
  authService: AuthService;
}

export class AdminService extends BaseService {
  private readonly truckRepo: TruckRepository;
  private readonly routeRepo: RouteRepository;
  private readonly assignmentRepo: AssignmentRepository;
  private readonly issueRepo: IssueRepository;
  private readonly userRepo: UserRepository;
  private readonly authService: AuthService;

  constructor({ truckRepo, routeRepo, assignmentRepo, issueRepo, userRepo, authService }: AdminServiceDependencies) {
    super();
    this.truckRepo = truckRepo;
    this.routeRepo = routeRepo;
    this.assignmentRepo = assignmentRepo;
    this.issueRepo = issueRepo;
    this.userRepo = userRepo;
    this.authService = authService;
  }

  /** Read from organization membership, the role the API authorizes on, not from the global `user.role`. */
  async getUsersByRole(organizationId: string, role: 'driver' | 'supervisor'): Promise<UserWithRole[]> {
    return this.userRepo.findOrganizationMembersByRole(organizationId, role);
  }

  async createDriver(
    data: { name: string; email: string; password: string },
    organizationId: string,
  ): Promise<UserWithRole> {
    return this.createOrganizationUser({ ...data, role: 'driver' }, organizationId);
  }

  async createUser(
    headers: Headers,
    data: { name: string; email: string; password: string; role: Exclude<AppRole, 'owner' | 'citizen'> },
    organizationId: string,
  ): Promise<UserWithRole> {
    await this.assertCanManage(headers, data.role);
    return this.createOrganizationUser(data, organizationId);
  }

  async getMembers(organizationId: string): Promise<UserWithRole[]> {
    return this.userRepo.findOrganizationMembers(organizationId);
  }

  /** A support user acting as the caller (`impersonatedBy`) may edit a profile but never a login. */
  async updateUser(
    headers: Headers,
    userId: string,
    data: { name: string; email: string; password?: string },
    caller: { organizationId: string; impersonatedBy: string | null },
  ): Promise<UserWithRole> {
    const { organizationId, impersonatedBy } = caller;
    const target = await this.userRepo.findOrganizationMember(userId, organizationId);
    if (!target) {
      throw new NotFoundError('User not found');
    }
    await this.assertCanManage(headers, target.role);

    const email = data.email.toLowerCase();
    const changesLogin = data.password !== undefined || email !== target.email.toLowerCase();
    if (impersonatedBy && changesLogin) {
      throw new ForbiddenError('An impersonated session cannot change a login');
    }

    const passwordHash = data.password ? await this.authService.hashPassword(data.password) : undefined;
    try {
      await this.userRepo.updateProfile(userId, data.name, email, passwordHash);
    } catch (error) {
      this.handleDatabaseError(error);
    }

    return { ...target, name: data.name, email };
  }

  /** Organization roles decide who may create or edit whom; the route permission alone would let a supervisor mint admins. */
  private async assertCanManage(headers: Headers, targetRole: AppRole): Promise<void> {
    const membership = await this.authService.api.getActiveMemberRole({ headers });
    const callerRoles = toRoleList(membership?.role);

    if (!canManageRole(callerRoles, targetRole)) {
      throw new ForbiddenError(`Your role cannot manage ${targetRole} users`);
    }
  }

  /**
   * Create a better-auth user and add them to the organization with the given role, through the
   * shared `createStaffUser` step (see `@lima-garbage/database`): better-auth's global user role
   * alone does not grant access to org-scoped routes, which resolve roles from organization
   * membership (see `resolveActiveOrganizationRoles` in shared/middleware/auth.ts). A user
   * created without membership can never sign in past those checks, so a failed membership write
   * deletes the user rather than leaving one behind.
   *
   * `createStaffUser` raises a better-auth `APIError` from `createUser` (a taken email) or a raw
   * pg error from the membership insert (a duplicate membership, a deleted organization), since
   * that insert runs as parameterized SQL rather than through better-auth's `addMember`. Route
   * each to the handler that knows its shape, or the pg error falls through as an unmapped 500.
   */
  private async createOrganizationUser(
    data: { name: string; email: string; password: string; role: Exclude<AppRole, 'citizen'> },
    organizationId: string,
  ): Promise<UserWithRole> {
    try {
      return await createStaffUser(this.authService.auth, this.authService.pool, { ...data, organizationId });
    } catch (error) {
      if (error instanceof APIError) {
        this.handleAuthApiError(error);
      }
      this.handleDatabaseError(error);
    }
  }

  getTrucks(scope: OrganizationScope): Promise<TruckWithDetails[]> {
    return this.truckRepo.findAllActive(scope);
  }

  async createTruck(scope: OrganizationScope, data: CreateTruckRequest): Promise<Truck> {
    try {
      return await this.truckRepo.create(scope, data);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async deactivateTruck(scope: OrganizationScope, id: string): Promise<void> {
    const success = await this.truckRepo.deactivate(scope, id);
    if (!success) {
      throw new NotFoundError('Truck not found');
    }
  }

  getRoutes(scope: OrganizationScope): Promise<RouteWithDetails[]> {
    return this.routeRepo.findAllActive(scope);
  }

  createRoute(scope: OrganizationScope, data: CreateRouteRequest, createdBy: string): Promise<Route> {
    return this.routeRepo.create(scope, data, createdBy);
  }

  async getRouteWaypoints(scope: OrganizationScope, routeId: string): Promise<RouteWaypoint[]> {
    if (!(await this.routeRepo.exists(scope, routeId))) {
      throw new NotFoundError('Route not found');
    }
    return this.routeRepo.findWaypointsByRouteId(scope, routeId);
  }

  async createAssignment(
    scope: OrganizationScope,
    data: CreateAssignmentRequest,
    assignedBy: string,
  ): Promise<RouteAssignment> {
    try {
      return await this.assignmentRepo.create(scope, data, assignedBy);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  getOpenIssues(scope: OrganizationScope): Promise<IssueReportSummary[]> {
    return this.issueRepo.findAllOpen(scope);
  }

  async createIssue(
    scope: OrganizationScope,
    data: { type: CitizenIssueType; description?: string; lat: number; lng: number },
    createdBy: string,
  ): Promise<void> {
    await this.issueRepo.createCitizenIssue(scope, createdBy, data);
  }

  private handleAuthApiError(error: unknown): never {
    if (error instanceof APIError) {
      // `status` is a name such as 'BAD_REQUEST'; the number is `statusCode`. better-auth reports a
      // taken email as a 400, so the code, not the status, tells a conflict from bad input.
      if (error.statusCode === HttpStatus.CONFLICT || error.body?.code?.startsWith('USER_ALREADY_EXISTS')) {
        throw new ConflictError(error.message);
      }
      if (error.statusCode === HttpStatus.BAD_REQUEST) {
        throw new ValidationError(error.message);
      }
    }
    throw error;
  }
}
