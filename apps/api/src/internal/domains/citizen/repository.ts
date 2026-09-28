import { BaseRepository } from '@/internal/shared/repository/base-repository';
import type { Location } from '../locations/models';
import { CitizenProfileQueries } from './queries';

/** Citizen profiles belong to the user, not to a municipality, so they follow a citizen who moves. */
export class CitizenProfileRepository extends BaseRepository {
  findLocation(userId: string): Promise<Location | null> {
    return this.executeQuerySingle<Location>(CitizenProfileQueries.findLocation, [userId]);
  }

  async upsertLocation(userId: string, location: Location): Promise<void> {
    await this.executeQuery(CitizenProfileQueries.upsertLocation, [userId, location.lat, location.lng]);
  }
}
