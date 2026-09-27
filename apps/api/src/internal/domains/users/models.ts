import type { AppRole } from '@lima-garbage/database';

export type MemberRole = AppRole;

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export interface UserWithRole extends User {
  role: MemberRole;
}
