import { badRequest } from '../utils/errors.js';
export const validate = (schema, location = 'body') => (req, _res, next) => {
  const parsed = schema.safeParse(req[location]);
  if (!parsed.success) return next(badRequest(parsed.error.issues.map((issue) => issue.message).join(', ')));
  req[location] = parsed.data;
  next();
};

