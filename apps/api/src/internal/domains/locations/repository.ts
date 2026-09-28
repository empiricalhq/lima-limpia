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
  /** Keeps the current location and the history row in one transaction: both land or neither does. */
  async recordTruckLocation(
    scope: OrganizationScope,
    truckId: string,
    assignmentId: string,
    location: LocationUpdate,
  ): Promise<void> {
    const params = [truckId, assignmentId, location.lat, location.lng, location.speed, location.heading];
    await this.transaction(scope, async (tx) => {
      await tx.write(LocationQueries.upsertTruckCurrentLocation, params);
      await tx.write(LocationQueries.createTruckLocationHistory, params);
    });
  }

  /** The closest active truck within 1 km of the point, if any has reported in the last ten minutes. */
  findNearestTruck(scope: Scope, point: Location): Promise<NearbyTruck | null> {
    return this.readOne<NearbyTruck>(scope, LocationQueries.findNearbyTrucks, [point.lat, point.lng]);
  }
}
