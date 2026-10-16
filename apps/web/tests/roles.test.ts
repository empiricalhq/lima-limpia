import { describe, expect, test } from 'bun:test';
import { hasAnyRole, PROTECTED_ROLES, toRoleList } from '../src/features/auth/roles';

describe('toRoleList', () => {
  test.each([
    ['a comma-joined multi-role membership string', 'driver,admin', ['driver', 'admin']],
    ['an already-parsed list', ['driver', 'admin'], ['driver', 'admin']],
    ['a single role', 'owner', ['owner']],
    ['null', null, []],
    ['undefined', undefined, []],
    ['an empty string', '', []],
  ])('reads %s', (_label, input, roles) => {
    expect(toRoleList(input)).toEqual(roles);
  });

  test('a comma-joined membership still matches a protected role', () => {
    expect(hasAnyRole(toRoleList('driver,admin'), PROTECTED_ROLES)).toBe(true);
  });
});
