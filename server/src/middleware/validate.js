import { badRequest } from '../utils/errors.js';
export const validate = (schema, location = 'body') => (req, _res, next) => {
  const parsed = schema.safeParse(req[location]);
  if (!parsed.success) return next(badRequest(parsed.error.issues.map((issue) => issue.message).join(', ')));
  // Express 5 exposes req.query as a read-only getter, so validated and
  // coerced query values must be stored separately instead of reassigned.
  if (location === 'query') req.validatedQuery = parsed.data;
  else req[location] = parsed.data;
  next();
};
