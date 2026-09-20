import type { AuthService } from './service';

// Derived from the configured AuthService instance, not a bare `betterAuth` call: the latter
// resolves generic defaults with no plugins applied, silently dropping org-plugin session fields
// like `activeOrganizationId`.
export type AuthUser = AuthService['auth']['$Infer']['Session']['user'];
export type AuthSession = AuthService['auth']['$Infer']['Session']['session'];

export interface AuthEnv {
  Variables: {
    user: AuthUser;
    session: AuthSession;
  };
}
