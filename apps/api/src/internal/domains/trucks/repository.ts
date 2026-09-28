import type { OrganizationScope, Scope } from '@/internal/shared/tenancy/scope';
import { TenantRepository } from '@/internal/shared/tenancy/tenant-repository';
import type { CitizenTruck, CreateTruckRequest, Truck, TruckWithDetails } from './models';
import { TruckQueries } from './queries';

export class TruckRepository extends TenantRepository {
  async findAllActive(scope: Scope): Promise<TruckWithDetails[]> {
    const { rows } = await this.read<TruckWithDetails>(scope, TruckQueries.findAllActiveWithDetails);
    return rows;
  }

  async findAllActiveForCitizens(scope: Scope): Promise<CitizenTruck[]> {
    const { rows } = await this.read<CitizenTruck>(scope, TruckQueries.findAllActiveForCitizens);
    return rows;
  }

  async create(scope: OrganizationScope, data: CreateTruckRequest): Promise<Truck> {
    const { rows } = await this.write<Truck>(scope, TruckQueries.create, [data.name, data.license_plate]);
    if (!rows[0]) {
      throw new Error('Database query failed to return created truck.');
    }
    return rows[0];
  }

  async deactivate(scope: OrganizationScope, id: string): Promise<boolean> {
    const { count } = await this.write(scope, TruckQueries.deactivate, [id]);
    return count > 0;
  }
}
