import { createAdminHandler } from '@/internal/domains/admin/handler';
import { AdminService } from '@/internal/domains/admin/service';
import { AssignmentRepository } from '@/internal/domains/assignments/repository';
import { createAuthHandler } from '@/internal/domains/auth/handler';

import { AuthService } from '@/internal/domains/auth/service';
import { createCitizenHandler } from '@/internal/domains/citizen/handler';
import { CitizenProfileRepository } from '@/internal/domains/citizen/repository';
import { CitizenService } from '@/internal/domains/citizen/service';
import { createDriverHandler } from '@/internal/domains/driver/handler';
import { DriverService } from '@/internal/domains/driver/service';
import { createHealthHandler } from '@/internal/domains/health/handler';
import { IssueRepository } from '@/internal/domains/issues/repository';
import { LocationRepository } from '@/internal/domains/locations/repository';
import { RouteRepository } from '@/internal/domains/routes/repository';
import { createSupportHandler } from '@/internal/domains/support/handler';
import { SupportRepository } from '@/internal/domains/support/repository';
import { SupportService } from '@/internal/domains/support/service';
import { TruckRepository } from '@/internal/domains/trucks/repository';
import { UserRepository } from '@/internal/domains/users/repository';
import { loadConfig } from '@/internal/shared/config/config';
import { Database } from '@/internal/shared/database/database';
import {
  createAuthMiddleware,
  createCitizenOnlyMiddleware,
  createImpersonatedSessionMiddleware,
  createPermissionMiddleware,
  createRefuseImpersonationMiddleware,
  createSupportMiddleware,
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
  const locationRepo = new LocationRepository(db);
  const profileRepo = new CitizenProfileRepository(db);
  const supportRepo = new SupportRepository(db);

  const emailService = new EmailService(config.email);
  const authService = new AuthService({ config, db, emailService });
  const supportService = new SupportService({ supportRepo, issueRepo, authService });
  const adminService = new AdminService({ truckRepo, routeRepo, assignmentRepo, issueRepo, userRepo, authService });
  const driverService = new DriverService({ assignmentRepo, routeRepo, issueRepo, locationRepo });
  const citizenService = new CitizenService({ issueRepo, truckRepo, routeRepo, locationRepo, profileRepo });

  const corsMiddleware = createCorsMiddleware(config);
  const authMiddleware = createAuthMiddleware(authService, supportRepo);
  const permissionMiddleware = createPermissionMiddleware(authService, supportRepo);
  const citizenOnlyMiddleware = createCitizenOnlyMiddleware(authService, supportRepo);
  const supportMiddleware = createSupportMiddleware(authService, supportRepo);
  const impersonatedSessionMiddleware = createImpersonatedSessionMiddleware(authService, supportRepo);

  const authHandler = createAuthHandler(authService, createRefuseImpersonationMiddleware(authService));
  const adminHandler = createAdminHandler(adminService, permissionMiddleware);
  const driverHandler = createDriverHandler(driverService, authMiddleware);
  const citizenHandler = createCitizenHandler(citizenService, citizenOnlyMiddleware);
  const supportHandler = createSupportHandler(
    supportService,
    adminService,
    supportMiddleware,
    impersonatedSessionMiddleware,
  );
  const healthHandler = createHealthHandler();

  return {
    getHandlers: () => ({
      admin: adminHandler,
      auth: authHandler,
      citizen: citizenHandler,
      driver: driverHandler,
      health: healthHandler,
      support: supportHandler,
    }),
    getCorsMiddleware: () => corsMiddleware,
  };
}
