import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';
import { unauthorized } from '../utils/errors.js';

export async function requireAuth(req, _res, next) {
  try {
    const header = req.get('authorization');
    const token = req.cookies?.kira_token || (header?.startsWith('Bearer ') ? header.slice(7) : null);
    if (!token) throw unauthorized();
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, name: true, email: true, createdAt: true } });
    if (!user) throw unauthorized('Your session is no longer valid.');
    req.user = user;
    next();
  } catch (error) { next(error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' ? unauthorized('Your session is invalid or expired.') : error); }
}

