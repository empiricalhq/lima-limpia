import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organization, user } from './auth.ts';

export const supportAuditActionEnum = pgEnum('support_audit_action_enum', [
  'impersonation.start',
  'impersonation.stop',
  'write',
]);

/**
 * What a support user did as another user. The foreign keys do not cascade, so a user or a
 * municipality with audit history cannot be deleted from under it. `session_id` has no key: the
 * impersonated session is deleted when it ends.
 */
export const supportAudit = pgTable(
  'support_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    action: supportAuditActionEnum('action').notNull(),
    impersonatorId: text('impersonator_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    impersonatedUserId: text('impersonated_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    organizationId: text('organization_id').references(() => organization.id, { onDelete: 'restrict' }),
    sessionId: text('session_id').notNull(),
    method: text('method'),
    path: text('path'),
    statusCode: integer('status_code'),
  },
  (table) => [
    index('support_audit_impersonator_idx').on(table.impersonatorId, table.createdAt),
    index('support_audit_organization_idx').on(table.organizationId, table.createdAt),
  ],
);
