import type { OrganizationScope, Scope, WriteScope } from '@/internal/shared/tenancy/scope';
import { TenantRepository } from '@/internal/shared/tenancy/tenant-repository';
import type {
  CitizenIssueReport,
  CreateCitizenIssueRequest,
  CreateDriverIssueRequest,
  IssueReportSummary,
} from './models';
import { IssueQueries } from './queries';

export class IssueRepository extends TenantRepository {
  /** `scope` is the municipality that receives the report, or unassigned when none is in reach. */
  async createCitizenIssue(scope: WriteScope, userId: string, data: CreateCitizenIssueRequest): Promise<void> {
    const { type, description, photo_url, lat, lng } = data;
    await this.write(scope, IssueQueries.createCitizenIssue, [userId, type, description, photo_url, lat, lng]);
  }

  async findCitizenIssuesByUserId(scope: Scope, userId: string): Promise<CitizenIssueReport[]> {
    const { rows } = await this.read<CitizenIssueReport>(scope, IssueQueries.findCitizenIssuesByUserId, [userId]);
    return rows;
  }

  async createDriverIssue(
    scope: OrganizationScope,
    driverId: string,
    assignmentId: string,
    data: CreateDriverIssueRequest,
  ): Promise<void> {
    const { type, notes, lat, lng } = data;
    await this.write(scope, IssueQueries.createDriverIssue, [driverId, assignmentId, type, notes, lat, lng]);
  }

  async findAllOpen(scope: Scope): Promise<IssueReportSummary[]> {
    const { rows } = await this.read<IssueReportSummary>(scope, IssueQueries.findAllOpen);
    return rows;
  }
}
