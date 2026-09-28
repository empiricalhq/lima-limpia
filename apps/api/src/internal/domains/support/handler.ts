import { Hono, type MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { success } from '@/internal/shared/utils/response';
import { validateJson, validateParam, validateQuery } from '@/internal/shared/utils/validation';
import type { AdminService } from '../admin/service';
import type { AuthEnv, StaffEnv } from '../auth/types';
import { CitizenSearchSchema, ImpersonateSchema, RouteParamSchema } from './schemas';
import type { SupportService } from './service';

/**
 * The support team's routes. Every route but the two session ones is a GET: reading a municipality
 * needs no impersonation, changing one does. The reads reuse the admin service under an explicit
 * `organizationScope`, so no unscoped query exists to reach for.
 */
export function createSupportHandler(
  supportService: SupportService,
  adminService: AdminService,
  supportOnly: MiddlewareHandler<AuthEnv>,
  impersonatedOnly: MiddlewareHandler<AuthEnv>,
): Hono<AuthEnv> {
  const support = new Hono<AuthEnv>();

  support.get('/organizations', supportOnly, async (c) => success(c, await supportService.listOrganizations()));

  support.get('/issues/unassigned', supportOnly, async (c) => success(c, await supportService.getUnassignedIssues()));

  support.get('/citizens', supportOnly, validateQuery(CitizenSearchSchema), async (c) => {
    const { email } = c.req.valid('query');
    return success(c, await supportService.findCitizensByEmail(email));
  });

  support.route('/organizations/:organizationId', createOrganizationReads(supportService, adminService, supportOnly));

  support.post('/impersonate', supportOnly, validateJson(ImpersonateSchema), async (c) => {
    const { userId, organizationId } = c.req.valid('json');
    const { headers } = await supportService.impersonate(c.req.raw.headers, c.get('user').id, userId, organizationId);
    forwardCookies(c, headers);
    return success(c, { userId });
  });

  support.post('/stop-impersonating', impersonatedOnly, async (c) => {
    const { headers } = await supportService.stopImpersonating(c.req.raw.headers, c.get('session'), c.get('user').id);
    forwardCookies(c, headers);
    return success(c, { stopped: true });
  });

  return support;
}

function createOrganizationReads(
  supportService: SupportService,
  adminService: AdminService,
  supportOnly: MiddlewareHandler<AuthEnv>,
): Hono<StaffEnv> {
  const reads = new Hono<StaffEnv>();

  reads.use('*', supportOnly);
  reads.use(
    '*',
    createMiddleware<StaffEnv>(async (c, next) => {
      c.set('scope', await supportService.scopeOf(c.req.param('organizationId') ?? ''));
      await next();
    }),
  );

  reads.get('/trucks', async (c) => success(c, await adminService.getTrucks(c.get('scope'))));
  reads.get('/routes', async (c) => success(c, await adminService.getRoutes(c.get('scope'))));
  reads.get('/routes/:id/waypoints', validateParam(RouteParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    return success(c, await adminService.getRouteWaypoints(c.get('scope'), id));
  });
  reads.get('/drivers', async (c) =>
    success(c, await adminService.getUsersByRole(c.get('scope').organizationId, 'driver')),
  );
  reads.get('/supervisors', async (c) =>
    success(c, await adminService.getUsersByRole(c.get('scope').organizationId, 'supervisor')),
  );
  reads.get('/members', async (c) => success(c, await adminService.getMembers(c.get('scope').organizationId)));
  reads.get('/issues', async (c) => success(c, await adminService.getOpenIssues(c.get('scope'))));

  return reads;
}

/** Pass on the cookies that switch the browser between the support session and the impersonated one. */
function forwardCookies(
  c: { header: (name: string, value: string, options: { append: boolean }) => void },
  headers: Headers,
) {
  for (const cookie of headers.getSetCookie()) {
    c.header('set-cookie', cookie, { append: true });
  }
}
