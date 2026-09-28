import type { AppRole } from '@lima-garbage/database';
import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { created, success } from '@/internal/shared/utils/response';
import { CommonSchemas, validateJson, validateParam } from '@/internal/shared/utils/validation';
import type { StaffEnv } from '../auth/types';
import { CreateDriverIssueSchema } from '../issues/schemas';
import { UpdateDriverLocationSchema } from '../locations/schemas';
import type { DriverService } from './service';

const IdParamSchema = z.object({ id: CommonSchemas.id });

export function createDriverHandler(
  driverService: DriverService,
  authMiddleware: (allowedRoles: AppRole[]) => MiddlewareHandler<StaffEnv>,
): Hono<StaffEnv> {
  const driver = new Hono<StaffEnv>();

  driver.use('*', authMiddleware(['driver']));

  driver.get('/route/current', async (c) => {
    const user = c.get('user');
    const route = await driverService.getCurrentRoute(c.get('scope'), user.id);
    return success(c, route);
  });

  driver.post('/assignments/:id/start', validateParam(IdParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const user = c.get('user');
    await driverService.startAssignment(c.get('scope'), id, user.id);
    return success(c, { success: true });
  });

  driver.post('/assignments/:id/complete', validateParam(IdParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const user = c.get('user');
    await driverService.completeAssignment(c.get('scope'), id, user.id);
    return success(c, { success: true });
  });

  driver.post('/location', validateJson(UpdateDriverLocationSchema), async (c) => {
    const locationData = c.req.valid('json');
    const user = c.get('user');
    await driverService.updateLocation(c.get('scope'), user.id, locationData);
    return success(c, { success: true });
  });

  driver.post('/issues', validateJson(CreateDriverIssueSchema), async (c) => {
    const issueData = c.req.valid('json');
    const user = c.get('user');
    await driverService.reportIssue(c.get('scope'), user.id, issueData);
    return created(c, { message: 'Issue reported successfully' });
  });

  return driver;
}
