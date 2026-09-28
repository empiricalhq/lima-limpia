import { BaseService } from '@/internal/shared/services/base-service';
import { allOrganizations, organizationScope, unassignedScope, type WriteScope } from '@/internal/shared/tenancy/scope';
import type { CitizenIssueReport, CreateCitizenIssueRequest } from '../issues/models';
import type { IssueRepository } from '../issues/repository';
import type { LocationRepository } from '../locations/repository';
import type { RouteRepository } from '../routes/repository';
import type { CitizenTruck } from '../trucks/models';
import type { TruckRepository } from '../trucks/repository';
import type { CitizenProfileRepository } from './repository';

const ETA_MINUTES_PER_KM = 10;
const NEARBY_DISTANCE_THRESHOLD_KM = 0.1;
const MINIMUM_ETA_MINUTES = 1;
const REPORT_ROUTING_RADIUS_KM = 5;

export type CitizenTruckStatusResponse =
  | { status: 'ON_THE_WAY'; etaMinutes: number; truckId: string; truckName: string }
  | { status: 'NEARBY'; truckId: string; truckName: string }
  | { status: 'NOT_SCHEDULED'; message: string }
  | { status: 'LOCATION_NOT_SET'; message: string };

interface CitizenServiceDependencies {
  issueRepo: IssueRepository;
  truckRepo: TruckRepository;
  routeRepo: RouteRepository;
  locationRepo: LocationRepository;
  profileRepo: CitizenProfileRepository;
}

/**
 * Citizens belong to no municipality: they see every municipality's active trucks and their own
 * reports, so this service reads under `allOrganizations` on purpose.
 */
export class CitizenService extends BaseService {
  private readonly issueRepo: IssueRepository;
  private readonly truckRepo: TruckRepository;
  private readonly routeRepo: RouteRepository;
  private readonly locationRepo: LocationRepository;
  private readonly profileRepo: CitizenProfileRepository;

  constructor({ issueRepo, truckRepo, routeRepo, locationRepo, profileRepo }: CitizenServiceDependencies) {
    super();
    this.issueRepo = issueRepo;
    this.truckRepo = truckRepo;
    this.routeRepo = routeRepo;
    this.locationRepo = locationRepo;
    this.profileRepo = profileRepo;
  }

  getTrucks(): Promise<CitizenTruck[]> {
    return this.truckRepo.findAllActiveForCitizens(allOrganizations);
  }

  async getTruckStatus(userId: string): Promise<CitizenTruckStatusResponse> {
    const profile = await this.profileRepo.findLocation(userId);
    if (!profile?.lat) {
      return { status: 'LOCATION_NOT_SET', message: 'Please set your location first' };
    }

    const nearbyTruck = await this.locationRepo.findNearestTruck(allOrganizations, profile);
    if (nearbyTruck) {
      const { truck_id, truck_name, distance_km } = nearbyTruck;

      if (distance_km < NEARBY_DISTANCE_THRESHOLD_KM) {
        return {
          status: 'NEARBY',
          truckId: truck_id,
          truckName: truck_name,
        };
      }

      const etaMinutes = Math.round(distance_km * ETA_MINUTES_PER_KM);
      return {
        status: 'ON_THE_WAY',
        etaMinutes: Math.max(MINIMUM_ETA_MINUTES, etaMinutes),
        truckId: truck_id,
        truckName: truck_name,
      };
    }

    return { status: 'NOT_SCHEDULED', message: 'No trucks currently scheduled for your area' };
  }

  async updateLocation(userId: string, lat: number, lng: number): Promise<void> {
    await this.profileRepo.upsertLocation(userId, { lat, lng });
  }

  /**
   * A report goes to the municipality whose active route passes nearest to it, within
   * {@link REPORT_ROUTING_RADIUS_KM}. Farther away no municipality serves the place, so the report
   * is stored unassigned rather than sent to one that cannot act on it.
   */
  async reportIssue(userId: string, data: CreateCitizenIssueRequest): Promise<void> {
    const scope = await this.resolveReportScope(data);
    await this.issueRepo.createCitizenIssue(scope, userId, data);
  }

  getUserIssues(userId: string): Promise<CitizenIssueReport[]> {
    return this.issueRepo.findCitizenIssuesByUserId(allOrganizations, userId);
  }

  private async resolveReportScope(point: { lat: number; lng: number }): Promise<WriteScope> {
    const organizationId = await this.routeRepo.findNearestActiveOrganizationId(
      allOrganizations,
      point,
      REPORT_ROUTING_RADIUS_KM,
    );
    return organizationId ? organizationScope(organizationId) : unassignedScope;
  }
}
