import type { User } from '../users/models';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
}

export interface ImpersonationTarget {
  id: string;
  role: string | null;
  banned: boolean;
}

export type Citizen = User;

export type AuditAction = 'impersonation.start' | 'impersonation.stop' | 'write';

/** One act of a support user as another user. `method` and `path` are set for writes. */
export interface AuditEntry {
  action: AuditAction;
  impersonatorId: string;
  impersonatedUserId: string;
  organizationId: string | null;
  sessionId: string;
  method?: string;
  path?: string;
}
