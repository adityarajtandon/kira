export class AppError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const badRequest = (message) => new AppError(400, 'VALIDATION_ERROR', message);
export const unauthorized = (message = 'Authentication is required.') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have permission to perform this action.') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (resource = 'Resource') => new AppError(404, 'NOT_FOUND', `${resource} not found.`);
export const conflict = (message) => new AppError(409, 'CONFLICT', message);

