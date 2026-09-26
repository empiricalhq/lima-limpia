import { APIError } from 'better-auth/api';
import { type AppRole, canManageRole } from '@/internal/shared/auth/roles';
import { BaseService } from '@/internal/shared/services/base-service';
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

  async updateUser(
    headers: Headers,
    userId: string,
    data: { name: string; email: string; password?: string },
    organizationId: string,
  ): Promise<UserWithRole> {
    const target = await this.userRepo.findOrganizationMember(userId, organizationId);
    if (!target) {
      throw new NotFoundError('User not found');
    }
    await this.assertCanManage(headers, target.role);

    const email = data.email.toLowerCase();
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
    const callerRoles = (Array.isArray(membership?.role) ? membership.role : [membership?.role]) as AppRole[];

    if (!canManageRole(callerRoles, targetRole)) {
      throw new ForbiddenError(`Your role cannot manage ${targetRole} users`);
    }
  }

  /**
   * Create a better-auth user and add them to the organization with the given role. Both steps
   * are required: better-auth's global user role alone does not grant access to org-scoped
   * routes, which resolve roles from organization membership (see `resolveActiveOrganizationRoles`
   * in shared/middleware/auth.ts). A user created without membership can never sign in past those
   * checks.
   */
  private async createOrganizationUser(
    data: { name: string; email: string; password: string; role: AppRole },
    organizationId: string,
  ): Promise<UserWithRole> {
    let userId: string;

    try {
      const result = await this.authService.api.createUser({
        body: { name: data.name, email: data.email, password: data.password, role: data.role },
      });
      userId = result.user.id;
    } catch (error) {
      this.handleAuthApiError(error);
    }

    try {
      await this.authService.api.addMember({
        body: { userId, role: data.role, organizationId },
      });
    } catch (error) {
      // biome-ignore lint/suspicious/noEmptyBlockStatements: cleanup is best effort; the membership error is what the caller should see.
      await this.authService.api.removeUser({ body: { userId } }).catch(() => {});
      this.handleAuthApiError(error);
    }

    return { id: userId, name: data.name, email: data.email, createdAt: new Date(), role: data.role };
  }

  async getTrucks(): Promise<TruckWithDetails[]> {
    return this.truckRepo.findAllActive();
  }

  async createTruck(data: CreateTruckRequest): Promise<Truck> {
    try {
      return await this.truckRepo.create(data);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async deactivateTruck(id: string): Promise<void> {
    const success = await this.truckRepo.deactivate(id);
    if (!success) {
      throw new NotFoundError('Truck not found');
    }
  }

  async getRoutes(): Promise<RouteWithDetails[]> {
    return this.routeRepo.findAllActive();
  }

  async createRoute(data: CreateRouteRequest, createdBy: string): Promise<Route> {
    return this.routeRepo.create(data, createdBy);
  }

  async getRouteWaypoints(routeId: string): Promise<RouteWaypoint[]> {
    return this.routeRepo.findWaypointsByRouteId(routeId);
  }

  async createAssignment(data: CreateAssignmentRequest, assignedBy: string): Promise<RouteAssignment> {
    try {
      return await this.assignmentRepo.create(data, assignedBy);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async getOpenIssues(): Promise<IssueReportSummary[]> {
    return this.issueRepo.findAllOpen();
  }

  async createIssue(
    data: { type: CitizenIssueType; description?: string; lat: number; lng: number },
    createdBy: string,
  ): Promise<void> {
    await this.issueRepo.createCitizenIssue(createdBy, data);
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
