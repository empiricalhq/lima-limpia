import type { OrganizationScope } from '@/internal/shared/tenancy/scope';
import { TenantRepository } from '@/internal/shared/tenancy/tenant-repository';
import type { AssignmentWithDetails, CreateAssignmentRequest, RouteAssignment } from './models';
import { AssignmentQueries } from './queries';

export class AssignmentRepository extends TenantRepository {
  async create(scope: OrganizationScope, data: CreateAssignmentRequest, assignedBy: string): Promise<RouteAssignment> {
    const { route_id, truck_id, driver_id, scheduled_start_time, scheduled_end_time, notes } = data;
    const { rows } = await this.write<RouteAssignment>(scope, AssignmentQueries.create, [
      route_id,
      truck_id,
      driver_id,
      scheduled_start_time,
      scheduled_end_time,
      notes,
      assignedBy,
    ]);

    if (!rows[0]) {
      throw new Error('Database query failed to return created assignment.');
    }
    return rows[0];
  }

  findCurrentByDriverId(scope: OrganizationScope, driverId: string): Promise<AssignmentWithDetails | null> {
    return this.readOne<AssignmentWithDetails>(scope, AssignmentQueries.findCurrentByDriverId, [driverId]);
  }

  async start(scope: OrganizationScope, id: string, driverId: string): Promise<boolean> {
    const { count } = await this.write(scope, AssignmentQueries.start, [id, driverId]);
    return count > 0;
  }

  async complete(scope: OrganizationScope, id: string, driverId: string): Promise<boolean> {
    const { count } = await this.write(scope, AssignmentQueries.complete, [id, driverId]);
    return count > 0;
  }

  findActiveByDriverId(scope: OrganizationScope, driverId: string): Promise<{ id: string; truck_id: string } | null> {
    return this.readOne<{ id: string; truck_id: string }>(scope, AssignmentQueries.findActiveByDriverId, [driverId]);
  }
}
