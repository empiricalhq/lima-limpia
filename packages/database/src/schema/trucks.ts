import { boolean, index, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { organization } from './auth.ts';

export const truck = pgTable(
  'truck',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    licensePlate: text('license_plate').notNull().unique(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    // Target of the composite foreign keys that keep a child row in its parent's organization.
    unique('truck_id_organization_uidx').on(table.id, table.organizationId),
    index('truck_organization_idx').on(table.organizationId),
  ],
);
