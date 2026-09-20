import type { DatabaseInterface } from '@/internal/shared/database/database';
import { BaseService } from '@/internal/shared/services/base-service';
import { NotFoundError, ValidationError } from '@/internal/shared/utils/errors';
import type { AssignmentWithDetails } from '../assignments/models';
import type { AssignmentRepository } from '../assignments/repository';
import type { CreateDriverIssueRequest } from '../issues/models';
import type { IssueRepository } from '../issues/repository';
import type { LocationUpdate } from '../locations/models';
import { LocationQueries } from '../locations/queries';
import type { RouteRepository } from '../routes/repository';

export class DriverService extends BaseService {
  private readonly assignmentRepo: AssignmentRepository;
  private readonly routeRepo: RouteRepository;
  private readonly issueRepo: IssueRepository;
  private readonly db: DatabaseInterface;

  constructor(
    assignmentRepo: AssignmentRepository,
    routeRepo: RouteRepository,
    issueRepo: IssueRepository,
    db: DatabaseInterface,
  ) {
    super();
    this.assignmentRepo = assignmentRepo;
    this.routeRepo = routeRepo;
    this.issueRepo = issueRepo;
    this.db = db;
  }

  async getCurrentRoute(driverId: string): Promise<AssignmentWithDetails> {
    const assignment = await this.assignmentRepo.findCurrentByDriverId(driverId);
    if (!assignment) {
      throw new NotFoundError('No upcoming or active route found');
    }

    assignment.waypoints = await this.routeRepo.findWaypointsByRouteId(assignment.route_id);
    return assignment;
  }

  async startAssignment(id: string, driverId: string): Promise<void> {
    const started = await this.assignmentRepo.start(id, driverId);
    if (!started) {
      throw new NotFoundError('Assignment not found or could not be started');
    }
  }

  async completeAssignment(id: string, driverId: string): Promise<void> {
    const completed = await this.assignmentRepo.complete(id, driverId);
    if (!completed) {
      throw new NotFoundError('Assignment not found or could not be completed');
    }
  }

  async updateLocation(driverId: string, location: LocationUpdate): Promise<void> {
    await this.db.withTransaction(async (client) => {
      const assignmentRes = await client.query<{ id: string; truck_id: string }>(
        `SELECT id, truck_id FROM route_assignment WHERE driver_id = $1 AND status = 'active' LIMIT 1`,
        [driverId],
      );

      const [assignment] = assignmentRes.rows;
      if (!assignment) {
        throw new ValidationError('No active assignment found for location update');
      }
      const { id: assignmentId, truck_id: truckId } = assignment;

      // Keep the current location and history row in the same transaction.
      await Promise.all([
        client.query(LocationQueries.upsertTruckCurrentLocation, [
          truckId,
          assignmentId,
          location.lat,
          location.lng,
          location.speed,
          location.heading,
        ]),
        client.query(LocationQueries.createTruckLocationHistory, [
          truckId,
          assignmentId,
          location.lat,
          location.lng,
          location.speed,
          location.heading,
        ]),
      ]);
    });
  }

  async reportIssue(driverId: string, data: CreateDriverIssueRequest): Promise<void> {
    const assignment = await this.assignmentRepo.findActiveByDriverId(driverId);
    if (!assignment) {
      throw new ValidationError('No active assignment found to report an issue');
    }
    await this.issueRepo.createDriverIssue(driverId, assignment.id, data);
  }
}
