import { BaseRepository } from '@/internal/shared/repository/base-repository';
import { ValidationError } from '@/internal/shared/utils/errors';
import type { MemberRole, UserWithRole } from './models';
import { UserQueries } from './queries';

export class UserRepository extends BaseRepository {
  async findOrganizationMember(userId: string, organizationId: string): Promise<UserWithRole | null> {
    return this.executeQuerySingle<UserWithRole>(UserQueries.findOrganizationMember, [userId, organizationId]);
  }

  /**
   * Writes the profile and, when given, the password hash in one transaction, so a failed
   * step leaves nothing applied. A new password also revokes every session of the user.
   */
  async updateProfile(userId: string, name: string, email: string, passwordHash?: string): Promise<void> {
    await this.db.withTransaction(async (client) => {
      await client.query(UserQueries.updateProfile, [userId, name, email]);
      if (!passwordHash) {
        return;
      }
      const result = await client.query(UserQueries.updateCredentialPassword, [userId, passwordHash]);
      if (result.rowCount === 0) {
        throw new ValidationError('User has no password sign-in to update');
      }
      await client.query(UserQueries.deleteSessions, [userId]);
    });
  }

  async findOrganizationMembersByRole(organizationId: string, role: MemberRole): Promise<UserWithRole[]> {
    return this.executeQuery<UserWithRole>(UserQueries.findOrganizationMembersByRole, [organizationId, role]);
  }
}
