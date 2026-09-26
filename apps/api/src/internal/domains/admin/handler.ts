import { type Context, Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import type { PermissionRequest } from '@/internal/shared/auth/roles';
import { created, noContent, success } from '@/internal/shared/utils/response';
import { CommonSchemas, validateJson, validateParam } from '@/internal/shared/utils/validation';
import { CreateAssignmentSchema } from '../assignments/schemas';
import type { AuthEnv } from '../auth/types';
import { CreateAdminIssueSchema } from '../issues/schemas';
import { CreateRouteSchema } from '../routes/schemas';
import { CreateTruckSchema } from '../trucks/schemas';
import { CreateDriverSchema, CreateUserSchema, UpdateUserSchema } from './schemas';
import type { AdminService } from './service';

const IdParamSchema = z.object({ id: CommonSchemas.id });

/** `requirePermission` only lets a request through with an active organization, so this is always set here. */
function getActiveOrganizationId(c: Context<AuthEnv>): string {
  const { activeOrganizationId } = c.get('session');
  if (!activeOrganizationId) {
    throw new Error('Expected an active organization after requirePermission');
  }
  return activeOrganizationId;
}

export function createAdminHandler(
  adminService: AdminService,
  requirePermission: (permission: PermissionRequest) => MiddlewareHandler<AuthEnv>,
): Hono<AuthEnv> {
  const admin = new Hono<AuthEnv>();

  admin.get('/drivers', requirePermission({ user: ['list'] }), async (c) => {
    const drivers = await adminService.getUsersByRole(getActiveOrganizationId(c), 'driver');
    return success(c, drivers);
  });

  admin.get('/supervisors', requirePermission({ user: ['list'] }), async (c) => {
    const supervisors = await adminService.getUsersByRole(getActiveOrganizationId(c), 'supervisor');
    return success(c, supervisors);
  });

  admin.post('/drivers', requirePermission({ user: ['create'] }), validateJson(CreateDriverSchema), async (c) => {
    const driverData = c.req.valid('json');
    const newDriver = await adminService.createDriver(driverData, getActiveOrganizationId(c));
    return created(c, newDriver);
  });

  admin.post('/users', requirePermission({ user: ['create'] }), validateJson(CreateUserSchema), async (c) => {
    const userData = c.req.valid('json');
    const newUser = await adminService.createUser(c.req.raw.headers, userData, getActiveOrganizationId(c));
    return created(c, newUser);
  });

  admin.patch(
    '/users/:id',
    requirePermission({ user: ['create'] }),
    validateParam(IdParamSchema),
    validateJson(UpdateUserSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const userData = c.req.valid('json');
      const updatedUser = await adminService.updateUser(c.req.raw.headers, id, userData, getActiveOrganizationId(c));
      return success(c, updatedUser);
    },
  );

  admin.get('/trucks', requirePermission({ truck: ['read'] }), async (c) => {
    const trucks = await adminService.getTrucks();
    return success(c, trucks);
  });

  admin.post('/trucks', requirePermission({ truck: ['create'] }), validateJson(CreateTruckSchema), async (c) => {
    const truckData = c.req.valid('json');
    const newTruck = await adminService.createTruck(truckData);
    return created(c, newTruck);
  });

  admin.delete('/trucks/:id', requirePermission({ truck: ['delete'] }), validateParam(IdParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    await adminService.deactivateTruck(id);
    return noContent(c);
  });

  admin.get('/routes', requirePermission({ route: ['read'] }), async (c) => {
    const routes = await adminService.getRoutes();
    return success(c, routes);
  });

  admin.post('/routes', requirePermission({ route: ['create'] }), validateJson(CreateRouteSchema), async (c) => {
    const routeData = c.req.valid('json');
    const user = c.get('user');
    const newRoute = await adminService.createRoute(routeData, user.id);
    return created(c, newRoute);
  });

  admin.get(
    '/routes/:id/waypoints',
    requirePermission({ route: ['read'] }),
    validateParam(IdParamSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const waypoints = await adminService.getRouteWaypoints(id);
      return success(c, waypoints);
    },
  );

  admin.post(
    '/assignments',
    requirePermission({ assignment: ['create'] }),
    validateJson(CreateAssignmentSchema),
    async (c) => {
      const assignmentData = c.req.valid('json');
      const user = c.get('user');
      const newAssignment = await adminService.createAssignment(assignmentData, user.id);
      return created(c, newAssignment);
    },
  );

  admin.get('/issues', requirePermission({ issue: ['read'] }), async (c) => {
    const issues = await adminService.getOpenIssues();
    return success(c, issues);
  });

  admin.post('/issues', requirePermission({ issue: ['create'] }), validateJson(CreateAdminIssueSchema), async (c) => {
    const issueData = c.req.valid('json');
    const user = c.get('user');
    await adminService.createIssue(issueData, user.id);
    return created(c, { message: 'Issue created successfully' });
  });

  return admin;
}
