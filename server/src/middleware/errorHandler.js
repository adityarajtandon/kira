import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors.js';

export function notFoundHandler(_req, res) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } }); }
export function errorHandler(error, _req, res, _next) {
  if (error instanceof AppError) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return res.status(409).json({ error: { code: 'CONFLICT', message: 'A record with that value already exists.' } });
  if (error instanceof Prisma.PrismaClientValidationError) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'The request contains invalid data.' } });
  console.error(error);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
}

