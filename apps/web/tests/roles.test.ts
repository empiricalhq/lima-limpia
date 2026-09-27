import { describe, expect, test } from 'bun:test';
import { hasAnyRole, PROTECTED_ROLES, toRoleList } from '../src/features/auth/roles';

describe('toRoleList', () => {
  test('splits a comma-joined multi-role membership string', () => {
    expect(toRoleList('driver,admin')).toEqual(['driver', 'admin']);
  });

  test('a comma-joined membership still matches a protected role', () => {
    expect(hasAnyRole(toRoleList('driver,admin'), PROTECTED_ROLES)).toBe(true);
  });

  test('passes an already-parsed list through unchanged', () => {
    expect(toRoleList(['driver', 'admin'])).toEqual(['driver', 'admin']);
  });

  test('a single role is not split', () => {
    expect(toRoleList('owner')).toEqual(['owner']);
  });

  test('null, undefined, and empty string all mean no role', () => {
    expect(toRoleList(null)).toEqual([]);
    expect(toRoleList(undefined)).toEqual([]);
    expect(toRoleList('')).toEqual([]);
  });
});
