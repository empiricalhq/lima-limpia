import { relations } from 'drizzle-orm';

import { account, session, user } from './auth.ts';
import { citizenProfile, userEducationProgress } from './citizens.ts';
import { dispatchMessage, pushNotificationToken } from './communications.ts';
import { citizenIssueReport, driverIssueReport, systemAlert } from './issues.ts';
import { truckCurrentLocation, truckLocationHistory } from './locations.ts';
import { route, routeAssignment, routeSchedule, routeWaypoint } from './routes.ts';
import { truck } from './trucks.ts';

export * from './auth.ts';
export * from './citizens.ts';
export * from './communications.ts';
export * from './issues.ts';
export * from './locations.ts';
export * from './routes.ts';
export * from './support.ts';
export * from './trucks.ts';

export const userRelations = relations(user, ({ many, one }) => ({
  accounts: many(account),
  sessions: many(session),
  profile: one(citizenProfile),
  educationProgress: many(userEducationProgress),
  createdRoutes: many(route, { relationName: 'createdBy' }),
  approvedRoutes: many(route, { relationName: 'approvedBy' }),
  driverAssignments: many(routeAssignment, { relationName: 'driver' }),
  assignmentsMade: many(routeAssignment, { relationName: 'assignedBy' }),
  driverIssueReports: many(driverIssueReport),
  citizenIssueReports: many(citizenIssueReport),
  sentMessages: many(dispatchMessage, { relationName: 'sent' }),
  receivedMessages: many(dispatchMessage, { relationName: 'received' }),
  pushTokens: many(pushNotificationToken),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const truckRelations = relations(truck, ({ one, many }) => ({
  currentLocation: one(truckCurrentLocation),
  locationHistory: many(truckLocationHistory),
  assignments: many(routeAssignment),
}));

export const truckCurrentLocationRelations = relations(truckCurrentLocation, ({ one }) => ({
  truck: one(truck, {
    fields: [truckCurrentLocation.truckId],
    references: [truck.id],
  }),
  assignment: one(routeAssignment, {
    fields: [truckCurrentLocation.routeAssignmentId],
    references: [routeAssignment.id],
  }),
}));

export const routeRelations = relations(route, ({ one, many }) => ({
  creator: one(user, {
    fields: [route.createdBy],
    references: [user.id],
    relationName: 'createdBy',
  }),
  approver: one(user, {
    fields: [route.approvedBy],
    references: [user.id],
    relationName: 'approvedBy',
  }),
  waypoints: many(routeWaypoint),
  schedules: many(routeSchedule),
  assignments: many(routeAssignment),
}));

export const routeWaypointRelations = relations(routeWaypoint, ({ one }) => ({
  route: one(route, {
    fields: [routeWaypoint.routeId],
    references: [route.id],
  }),
}));

export const routeScheduleRelations = relations(routeSchedule, ({ one }) => ({
  route: one(route, {
    fields: [routeSchedule.routeId],
    references: [route.id],
  }),
}));

export const routeAssignmentRelations = relations(routeAssignment, ({ one, many }) => ({
  route: one(route, {
    fields: [routeAssignment.routeId],
    references: [route.id],
  }),
  truck: one(truck, {
    fields: [routeAssignment.truckId],
    references: [truck.id],
  }),
  driver: one(user, {
    fields: [routeAssignment.driverId],
    references: [user.id],
    relationName: 'driver',
  }),
  assignedBy: one(user, {
    fields: [routeAssignment.assignedBy],
    references: [user.id],
    relationName: 'assignedBy',
  }),
  systemAlerts: many(systemAlert),
  driverIssueReports: many(driverIssueReport),
}));

export const citizenProfileRelations = relations(citizenProfile, ({ one }) => ({
  user: one(user, {
    fields: [citizenProfile.userId],
    references: [user.id],
  }),
}));

export const userEducationProgressRelations = relations(userEducationProgress, ({ one }) => ({
  user: one(user, {
    fields: [userEducationProgress.userId],
    references: [user.id],
  }),
}));

export const systemAlertRelations = relations(systemAlert, ({ one }) => ({
  assignment: one(routeAssignment, {
    fields: [systemAlert.routeAssignmentId],
    references: [routeAssignment.id],
  }),
  truck: one(truck, {
    fields: [systemAlert.truckId],
    references: [truck.id],
  }),
  driver: one(user, {
    fields: [systemAlert.driverId],
    references: [user.id],
  }),
}));

export const driverIssueReportRelations = relations(driverIssueReport, ({ one }) => ({
  driver: one(user, {
    fields: [driverIssueReport.driverId],
    references: [user.id],
  }),
  assignment: one(routeAssignment, {
    fields: [driverIssueReport.routeAssignmentId],
    references: [routeAssignment.id],
  }),
}));

export const citizenIssueReportRelations = relations(citizenIssueReport, ({ one }) => ({
  user: one(user, {
    fields: [citizenIssueReport.userId],
    references: [user.id],
  }),
}));

export const dispatchMessageRelations = relations(dispatchMessage, ({ one }) => ({
  sender: one(user, {
    fields: [dispatchMessage.senderId],
    references: [user.id],
    relationName: 'sent',
  }),
  recipient: one(user, {
    fields: [dispatchMessage.recipientId],
    references: [user.id],
    relationName: 'received',
  }),
}));

export const pushNotificationTokenRelations = relations(pushNotificationToken, ({ one }) => ({
  user: one(user, {
    fields: [pushNotificationToken.userId],
    references: [user.id],
  }),
}));
