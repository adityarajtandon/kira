import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { authSchema, registerSchema } from '../validators/schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { conflict, unauthorized } from '../utils/errors.js';

const router = Router();
const publicUser = { id: true, name: true, email: true, createdAt: true };
function setSession(res, user) {
  const token = jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('kira_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
}

router.post('/register', validate(registerSchema), asyncHandler(async (req, res) => {
  if (await prisma.user.findUnique({ where: { email: req.body.email } })) throw conflict('An account with this email already exists.');
  const user = await prisma.user.create({ data: { ...req.body, passwordHash: await bcrypt.hash(req.body.password, 12), password: undefined }, select: publicUser });
  setSession(res, user);
  res.status(201).json({ data: user });
}));
router.post('/login', validate(authSchema), asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { email: req.body.email } });
  if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) throw unauthorized('Email or password is incorrect.');
  setSession(res, user);
  res.json({ data: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt } });
}));
router.post('/logout', (_req, res) => { res.clearCookie('kira_token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' }); res.status(204).end(); });
router.get('/me', requireAuth, (req, res) => res.json({ data: req.user }));
export default router;

