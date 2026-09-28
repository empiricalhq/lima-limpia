import { doublePrecision, foreignKey, index, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organization, user } from './auth.ts';
import { routeAssignment } from './routes.ts';
import { truck } from './trucks.ts';

export const alertTypeEnum = pgEnum('alert_type', ['route_deviation', 'prolonged_stop', 'late_start']);
export const alertStatusEnum = pgEnum('alert_status', ['unread', 'read', 'archived']);
export const issueStatusEnum = pgEnum('issue_status', ['open', 'in_progress', 'resolved']);

export const systemAlert = pgTable(
  'system_alert',
  {
    id: text('id').primaryKey(),
    type: alertTypeEnum('type').notNull(),
    message: text('message').notNull(),
    status: alertStatusEnum('status').default('unread').notNull(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    routeAssignmentId: text('route_assignment_id'),
    truckId: text('truck_id'),
    driverId: text('driver_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    // A composite SET NULL would also null organization_id, so a referenced assignment or truck cannot be deleted.
    foreignKey({
      name: 'system_alert_assignment_organization_fk',
      columns: [table.routeAssignmentId, table.organizationId],
      foreignColumns: [routeAssignment.id, routeAssignment.organizationId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'system_alert_truck_organization_fk',
      columns: [table.truckId, table.organizationId],
      foreignColumns: [truck.id, truck.organizationId],
    }).onDelete('restrict'),
    index('system_alert_organization_idx').on(table.organizationId),
    index('system_alert_status_idx').on(table.status),
    index('system_alert_created_at_idx').on(table.createdAt),
  ],
);

export const driverIssueReport = pgTable(
  'driver_issue_report',
  {
    id: text('id').primaryKey(),
    driverId: text('driver_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    routeAssignmentId: text('route_assignment_id').notNull(),
    organizationId: text('organization_id').notNull(),
    type: text('type').notNull(),
    status: issueStatusEnum('status').default('open').notNull(),
    notes: text('notes'),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at'),
  },
  (table) => [
    foreignKey({
      name: 'driver_issue_report_assignment_organization_fk',
      columns: [table.routeAssignmentId, table.organizationId],
      foreignColumns: [routeAssignment.id, routeAssignment.organizationId],
    }).onDelete('cascade'),
    index('driver_issue_report_organization_idx').on(table.organizationId),
    index('driver_issue_report_status_idx').on(table.status),
    index('driver_issue_report_driver_idx').on(table.driverId),
  ],
);

export const citizenIssueReport = pgTable(
  'citizen_issue_report',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Null until a municipality receives the report; see the citizen report routing in ARCHITECTURE.md.
    organizationId: text('organization_id').references(() => organization.id, { onDelete: 'restrict' }),
    type: text('type').notNull(),
    status: issueStatusEnum('status').default('open').notNull(),
    description: text('description'),
    photoUrl: text('photo_url'),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('citizen_issue_report_organization_idx').on(table.organizationId),
    index('citizen_issue_report_status_idx').on(table.status),
    index('citizen_issue_report_type_idx').on(table.type),
    index('citizen_issue_report_user_idx').on(table.userId),
  ],
);
