import { BaseService } from '@/internal/shared/services/base-service';
import type { OrganizationScope } from '@/internal/shared/tenancy/scope';
import { NotFoundError, ValidationError } from '@/internal/shared/utils/errors';
import type { AssignmentWithDetails } from '../assignments/models';
import type { AssignmentRepository } from '../assignments/repository';
import type { CreateDriverIssueRequest } from '../issues/models';
import type { IssueRepository } from '../issues/repository';
import type { LocationUpdate } from '../locations/models';
import type { LocationRepository } from '../locations/repository';
import type { RouteRepository } from '../routes/repository';

interface DriverServiceDependencies {
  assignmentRepo: AssignmentRepository;
  routeRepo: RouteRepository;
  issueRepo: IssueRepository;
  locationRepo: LocationRepository;
}

/** Every method acts for a driver inside the municipality of their active organization. */
export class DriverService extends BaseService {
  private readonly assignmentRepo: AssignmentRepository;
  private readonly routeRepo: RouteRepository;
  private readonly issueRepo: IssueRepository;
  private readonly locationRepo: LocationRepository;

  constructor({ assignmentRepo, routeRepo, issueRepo, locationRepo }: DriverServiceDependencies) {
    super();
    this.assignmentRepo = assignmentRepo;
    this.routeRepo = routeRepo;
    this.issueRepo = issueRepo;
    this.locationRepo = locationRepo;
  }

  async getCurrentRoute(scope: OrganizationScope, driverId: string): Promise<AssignmentWithDetails> {
    const assignment = await this.assignmentRepo.findCurrentByDriverId(scope, driverId);
    if (!assignment) {
      throw new NotFoundError('No upcoming or active route found');
    }

    assignment.waypoints = await this.routeRepo.findWaypointsByRouteId(scope, assignment.route_id);
    return assignment;
  }

  async startAssignment(scope: OrganizationScope, id: string, driverId: string): Promise<void> {
    const started = await this.assignmentRepo.start(scope, id, driverId);
    if (!started) {
      throw new NotFoundError('Assignment not found or could not be started');
    }
  }

  async completeAssignment(scope: OrganizationScope, id: string, driverId: string): Promise<void> {
    const completed = await this.assignmentRepo.complete(scope, id, driverId);
    if (!completed) {
      throw new NotFoundError('Assignment not found or could not be completed');
    }
  }

  async updateLocation(scope: OrganizationScope, driverId: string, location: LocationUpdate): Promise<void> {
    const assignment = await this.assignmentRepo.findActiveByDriverId(scope, driverId);
    if (!assignment) {
      throw new ValidationError('No active assignment found for location update');
    }

    await this.locationRepo.recordTruckLocation(scope, assignment.truck_id, assignment.id, location);
  }

  async reportIssue(scope: OrganizationScope, driverId: string, data: CreateDriverIssueRequest): Promise<void> {
    const assignment = await this.assignmentRepo.findActiveByDriverId(scope, driverId);
    if (!assignment) {
      throw new ValidationError('No active assignment found to report an issue');
    }
    await this.issueRepo.createDriverIssue(scope, driverId, assignment.id, data);
  }
}
