import { foreignKey, index, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { member, organization, user } from './auth.ts';

export const deviceTypeEnum = pgEnum('device_type', ['ios', 'android']);

export const dispatchMessage = pgTable(
  'dispatch_message',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    senderId: text('sender_id').notNull(),
    recipientId: text('recipient_id').notNull(),
    content: text('content').notNull(),
    readAt: timestamp('read_at'),
    sentAt: timestamp('sent_at').defaultNow().notNull(),
  },
  (table) => [
    // Dispatch is staff to staff: both ends must be members of the message's organization.
    foreignKey({
      name: 'dispatch_message_sender_member_fk',
      columns: [table.senderId, table.organizationId],
      foreignColumns: [member.userId, member.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'dispatch_message_recipient_member_fk',
      columns: [table.recipientId, table.organizationId],
      foreignColumns: [member.userId, member.organizationId],
    }).onDelete('cascade'),
    index('dispatch_message_organization_idx').on(table.organizationId),
    index('dispatch_message_recipient_sent_idx').on(table.recipientId, table.sentAt),
  ],
);

export const pushNotificationToken = pgTable(
  'push_notification_token',
  {
    token: text('token').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    deviceType: deviceTypeEnum('device_type').notNull(),
    lastUsedAt: timestamp('last_used_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('push_notification_token_user_idx').on(table.userId)],
);
