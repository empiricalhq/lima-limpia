import { doublePrecision, foreignKey, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { routeAssignment } from './routes.ts';
import { truck } from './trucks.ts';

export const truckCurrentLocation = pgTable(
  'truck_current_location',
  {
    truckId: text('truck_id').primaryKey(),
    organizationId: text('organization_id').notNull(),
    routeAssignmentId: text('route_assignment_id'),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    speed: doublePrecision('speed'),
    heading: doublePrecision('heading'),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    foreignKey({
      name: 'truck_current_location_truck_organization_fk',
      columns: [table.truckId, table.organizationId],
      foreignColumns: [truck.id, truck.organizationId],
    }).onDelete('cascade'),
    // A composite SET NULL would also null organization_id, so a referenced assignment cannot be deleted.
    foreignKey({
      name: 'truck_current_location_assignment_organization_fk',
      columns: [table.routeAssignmentId, table.organizationId],
      foreignColumns: [routeAssignment.id, routeAssignment.organizationId],
    }).onDelete('restrict'),
    index('truck_current_location_organization_idx').on(table.organizationId),
  ],
);

export const truckLocationHistory = pgTable(
  'truck_location_history',
  {
    id: text('id').primaryKey(),
    truckId: text('truck_id').notNull(),
    organizationId: text('organization_id').notNull(),
    routeAssignmentId: text('route_assignment_id'),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    speed: doublePrecision('speed'),
    heading: doublePrecision('heading'),
    recordedAt: timestamp('recorded_at').defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'truck_location_history_truck_organization_fk',
      columns: [table.truckId, table.organizationId],
      foreignColumns: [truck.id, truck.organizationId],
    }).onDelete('cascade'),
    index('truck_location_history_truck_recorded_idx').on(table.truckId, table.recordedAt),
    index('truck_location_history_assignment_idx').on(table.routeAssignmentId),
    index('truck_location_history_organization_idx').on(table.organizationId),
  ],
);
