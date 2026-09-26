// biome-ignore-all lint/style/noExcessiveClassesPerFile: a small, cohesive app-error hierarchy.
import { type ContentfulStatusCode, HttpStatus } from './http-status';

export class AppError extends Error {
  readonly statusCode: ContentfulStatusCode;

  constructor(message: string, statusCode: ContentfulStatusCode) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, HttpStatus.NOT_FOUND);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, HttpStatus.FORBIDDEN);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, HttpStatus.CONFLICT);
  }
}
