import { Hono } from 'hono';
import { logger } from 'hono/logger';

import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';

import { createContainer } from '@/internal/container/container';
import { AppError } from '@/internal/shared/utils/errors';
import { HttpStatus } from '@/internal/shared/utils/http-status';
import { error as errorResponse, notFound, validationError } from '@/internal/shared/utils/response';

const container = createContainer();
const handlers = container.getHandlers();

const app = new Hono();

app.use(logger());
app.use('*', container.getCorsMiddleware());
app.use('*', secureHeaders());

app.route('/api', handlers.health);
app.route('/api/auth', handlers.auth);
app.route('/api/admin', handlers.admin);
app.route('/api/driver', handlers.driver);
app.route('/api/citizen', handlers.citizen);
app.route('/api/support', handlers.support);

app.onError((err, c) => {
  if (err instanceof AppError) {
    return errorResponse(c, err.message, err.statusCode);
  }

  if (err instanceof z.ZodError) {
    const { formErrors, fieldErrors } = err.flatten();
    return validationError(c, formErrors, fieldErrors);
  }
  return errorResponse(c, 'Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
});

app.notFound((c) => notFound(c, 'Not found'));

export { app };
