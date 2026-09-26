import { createAdminHandler } from '@/internal/domains/admin/handler';
import { AdminService } from '@/internal/domains/admin/service';
import { AssignmentRepository } from '@/internal/domains/assignments/repository';
import { createAuthHandler } from '@/internal/domains/auth/handler';

import { AuthService } from '@/internal/domains/auth/service';
import { createCitizenHandler } from '@/internal/domains/citizen/handler';
import { CitizenService } from '@/internal/domains/citizen/service';
import { createDriverHandler } from '@/internal/domains/driver/handler';
import { DriverService } from '@/internal/domains/driver/service';
import { createHealthHandler } from '@/internal/domains/health/handler';
import { IssueRepository } from '@/internal/domains/issues/repository';
import { RouteRepository } from '@/internal/domains/routes/repository';
import { TruckRepository } from '@/internal/domains/trucks/repository';
import { UserRepository } from '@/internal/domains/users/repository';
import { appAc, appPluginRoles } from '@/internal/shared/auth/roles';
import { loadConfig } from '@/internal/shared/config/config';
import { Database } from '@/internal/shared/database/database';
import {
  createAuthMiddleware,
  createCitizenOnlyMiddleware,
  createPermissionMiddleware,
} from '@/internal/shared/middleware/auth';
import { createCorsMiddleware } from '@/internal/shared/middleware/cors';
import { EmailService } from '@/internal/shared/services/email';

export function createContainer() {
  const config = loadConfig();
  const db = new Database(config.database);

  const truckRepo = new TruckRepository(db);
  const routeRepo = new RouteRepository(db);
  const assignmentRepo = new AssignmentRepository(db);
  const issueRepo = new IssueRepository(db);
  const userRepo = new UserRepository(db);

  const emailService = new EmailService(config.email);
  const authService = new AuthService({ config, db, accessControl: appAc, roles: appPluginRoles, emailService });
  const adminService = new AdminService({ truckRepo, routeRepo, assignmentRepo, issueRepo, userRepo, authService });
  const driverService = new DriverService(assignmentRepo, routeRepo, issueRepo, db);
  const citizenService = new CitizenService(issueRepo, db, truckRepo);

  const corsMiddleware = createCorsMiddleware(config);
  const authMiddleware = createAuthMiddleware(authService);
  const permissionMiddleware = createPermissionMiddleware(authService);
  const citizenOnlyMiddleware = createCitizenOnlyMiddleware(authService);

  const authHandler = createAuthHandler(authService);
  const adminHandler = createAdminHandler(adminService, permissionMiddleware);
  const driverHandler = createDriverHandler(driverService, authMiddleware);
  const citizenHandler = createCitizenHandler(citizenService, citizenOnlyMiddleware);
  const healthHandler = createHealthHandler();

  return {
    getHandlers: () => ({
      admin: adminHandler,
      auth: authHandler,
      citizen: citizenHandler,
      driver: driverHandler,
      health: healthHandler,
    }),
    getCorsMiddleware: () => corsMiddleware,
  };
}
