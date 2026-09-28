import type { OrganizationScope, Scope } from '@/internal/shared/tenancy/scope';
import { TenantRepository } from '@/internal/shared/tenancy/tenant-repository';
import type { Location, LocationUpdate } from './models';
import { LocationQueries } from './queries';

export interface NearbyTruck {
  truck_id: string;
  truck_name: string;
  distance_km: number;
}

export class LocationRepository extends TenantRepository {
  /**
   * Records the driver's location against their active assignment, or returns false when they have
   * none. The assignment is read and locked in the same transaction as the writes, so it cannot
   * complete in between, and the current location and the history row both land or neither does.
   */
  recordDriverLocation(scope: OrganizationScope, driverId: string, location: LocationUpdate): Promise<boolean> {
    return this.transaction(scope, async (tx) => {
      const { rows } = await tx.read<{ id: string; truck_id: string }>(LocationQueries.lockActiveAssignmentByDriverId, [
        driverId,
      ]);
      const [assignment] = rows;
      if (!assignment) {
        return false;
      }
      const params = [assignment.truck_id, assignment.id, location.lat, location.lng, location.speed, location.heading];
      await tx.write(LocationQueries.upsertTruckCurrentLocation, params);
      await tx.write(LocationQueries.createTruckLocationHistory, params);
      return true;
    });
  }

  /** The closest active truck within 1 km of the point, if any has reported in the last ten minutes. */
  findNearestTruck(scope: Scope, point: Location): Promise<NearbyTruck | null> {
    return this.readOne<NearbyTruck>(scope, LocationQueries.findNearbyTrucks, [point.lat, point.lng]);
  }
}
