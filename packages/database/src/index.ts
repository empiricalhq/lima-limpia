export * from './auth/index.ts';
export * from './schema/index.ts';

export type User = typeof import('./schema').user.$inferSelect;
export type NewUser = typeof import('./schema').user.$inferInsert;
export type Route = typeof import('./schema').route.$inferSelect;
export type NewRoute = typeof import('./schema').route.$inferInsert;
export type Truck = typeof import('./schema').truck.$inferSelect;
export type NewTruck = typeof import('./schema').truck.$inferInsert;
export type RouteAssignment = typeof import('./schema').routeAssignment.$inferSelect;
export type NewRouteAssignment = typeof import('./schema').routeAssignment.$inferInsert;
