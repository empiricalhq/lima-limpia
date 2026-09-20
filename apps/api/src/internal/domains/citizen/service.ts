import type { DatabaseInterface } from '@/internal/shared/database/database';
import { BaseService } from '@/internal/shared/services/base-service';
import type { CitizenIssueReport, CreateCitizenIssueRequest } from '../issues/models';
import type { IssueRepository } from '../issues/repository';
import { LocationQueries } from '../locations/queries';
import type { TruckWithDetails } from '../trucks/models';
import type { TruckRepository } from '../trucks/repository';

const ETA_MINUTES_PER_KM = 10;
const NEARBY_DISTANCE_THRESHOLD_KM = 0.1;
const MINIMUM_ETA_MINUTES = 1;

export type CitizenTruckStatusResponse =
  | { status: 'ON_THE_WAY'; etaMinutes: number; truckId: string; truckName: string }
  | { status: 'NEARBY'; truckId: string; truckName: string }
  | { status: 'NOT_SCHEDULED'; message: string }
  | { status: 'LOCATION_NOT_SET'; message: string };

export class CitizenService extends BaseService {
  private readonly issueRepo: IssueRepository;
  private readonly db: DatabaseInterface;
  private readonly truckRepo: TruckRepository;

  constructor(issueRepo: IssueRepository, db: DatabaseInterface, truckRepo: TruckRepository) {
    super();
    this.issueRepo = issueRepo;
    this.db = db;
    this.truckRepo = truckRepo;
  }

  async getTrucks(): Promise<TruckWithDetails[]> {
    return this.truckRepo.findAllActive();
  }

  async getTruckStatus(userId: string): Promise<CitizenTruckStatusResponse> {
    const profileResult = await this.db.query<{ lat: number; lng: number }>(
      LocationQueries.findCitizenProfileLocation,
      [userId],
    );

    const [profile] = profileResult.rows;
    if (!profile?.lat) {
      return { status: 'LOCATION_NOT_SET', message: 'Please set your location first' };
    }

    const { lat, lng } = profile;
    const nearbyResult = await this.db.query<{ truck_id: string; truck_name: string; distance_km: number }>(
      LocationQueries.findNearbyTrucks,
      [lat, lng],
    );

    const [nearbyTruck] = nearbyResult.rows;
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
    await this.db.query(LocationQueries.upsertCitizenProfileLocation, [userId, lat, lng]);
  }

  async reportIssue(userId: string, data: CreateCitizenIssueRequest): Promise<void> {
    await this.issueRepo.createCitizenIssue(userId, data);
  }

  async getUserIssues(userId: string): Promise<CitizenIssueReport[]> {
    return this.issueRepo.findCitizenIssuesByUserId(userId);
  }
}
