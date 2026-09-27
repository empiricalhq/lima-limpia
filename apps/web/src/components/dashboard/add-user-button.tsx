import { getUserRoles } from '@/features/auth/lib';
import { hasAnyRole, SETTINGS_ROLES } from '@/features/auth/roles';
import { AddUserDialog } from './add-user-dialog';

export async function AddUserButton() {
  const roles = await getUserRoles();

  if (!hasAnyRole(roles, SETTINGS_ROLES)) {
    return null;
  }

  return <AddUserDialog />;
}
