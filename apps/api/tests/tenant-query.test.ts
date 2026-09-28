import { describe, expect, test } from 'bun:test';
import { allOrganizations, organizationScope, unassignedScope } from '@/internal/shared/tenancy/scope';
import { bindScope, tenantQuery } from '@/internal/shared/tenancy/tenant-query';

describe('tenantQuery', () => {
  test('refuses a statement with no scope marker', () => {
    expect(() => tenantQuery('SELECT * FROM truck')).toThrow('marker');
  });

  test('refuses a statement whose only filter is a hand-written organization id', () => {
    expect(() => tenantQuery('SELECT * FROM truck WHERE organization_id = $1')).toThrow('marker');
  });

  test('accepts a read marker and a write marker', () => {
    expect(() => tenantQuery('SELECT * FROM truck t WHERE {{scope:t}}')).not.toThrow();
    expect(() => tenantQuery('INSERT INTO truck (id, organization_id) VALUES ($1, {{organization_id}})')).not.toThrow();
  });
});

describe('bindScope', () => {
  const read = tenantQuery('SELECT * FROM truck t WHERE t.is_active = $1 AND {{scope:t}}');

  test('binds the organization as the parameter after the caller parameters', () => {
    const bound = bindScope(read, organizationScope('org-1'), [true]);

    expect(bound.text).toBe('SELECT * FROM truck t WHERE t.is_active = $1 AND t.organization_id = $2');
    expect(bound.values).toEqual([true, 'org-1']);
  });

  test('reads every organization only when asked for all of them', () => {
    const bound = bindScope(read, allOrganizations, [true]);

    expect(bound.text).toBe('SELECT * FROM truck t WHERE t.is_active = $1 AND TRUE');
    expect(bound.values).toEqual([true]);
  });

  test('an unassigned scope matches rows that no organization owns', () => {
    const bound = bindScope(read, unassignedScope, [true]);

    expect(bound.text).toBe('SELECT * FROM truck t WHERE t.is_active = $1 AND t.organization_id IS NULL');
  });

  test('expands the insert marker to the scope organization', () => {
    const insert = tenantQuery('INSERT INTO truck (id, organization_id) VALUES ($1, {{organization_id}})');

    expect(bindScope(insert, organizationScope('org-1'), ['t']).text).toBe(
      'INSERT INTO truck (id, organization_id) VALUES ($1, $2)',
    );
    expect(bindScope(insert, unassignedScope, ['t']).text).toBe(
      'INSERT INTO truck (id, organization_id) VALUES ($1, NULL)',
    );
  });

  test('refuses to insert a row into every organization', () => {
    const insert = tenantQuery('INSERT INTO truck (id, organization_id) VALUES ($1, {{organization_id}})');

    expect(() => bindScope(insert, allOrganizations, ['t'])).toThrow('all organizations');
  });

  test('an empty organization id never widens the query', () => {
    expect(() => organizationScope('')).toThrow();
  });
});
