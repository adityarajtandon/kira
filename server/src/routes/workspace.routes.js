import { Router } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace, ROLE_LEVEL } from '../middleware/workspace.js';
import { validate } from '../middleware/validate.js';
import { invitationSchema, workspaceSchema } from '../validators/schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { activityData } from '../utils/activity.js';
import { conflict, forbidden, notFound } from '../utils/errors.js';

const router = Router();
router.use(requireAuth);
const slugify = (name) => `${name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${crypto.randomBytes(3).toString('hex')}`;

router.get('/', asyncHandler(async (req, res) => {
  const memberships = await prisma.workspaceMember.findMany({ where: { userId: req.user.id }, include: { workspace: { include: { _count: { select: { members: true, projects: true } } } } }, orderBy: { joinedAt: 'desc' } });
  res.json({ data: memberships.map(({ workspace, role, joinedAt }) => ({ ...workspace, role, joinedAt })) });
}));
router.post('/', validate(workspaceSchema), asyncHandler(async (req, res) => {
  const workspace = await prisma.$transaction(async (tx) => {
    const created = await tx.workspace.create({ data: { name: req.body.name, slug: slugify(req.body.name), members: { create: { userId: req.user.id, role: 'OWNER' } } } });
    await tx.activityLog.create({ data: activityData(created.id, req.user.id, 'WORKSPACE_CREATED', 'workspace', created.id, { name: created.name }) });
    return created;
  });
  res.status(201).json({ data: { ...workspace, role: 'OWNER' } });
}));
router.get('/:workspaceId', requireWorkspace(), asyncHandler(async (req, res) => {
  const workspace = await prisma.workspace.findUnique({ where: { id: req.params.workspaceId }, include: { projects: { include: { _count: { select: { tasks: true } } }, orderBy: { createdAt: 'desc' } }, _count: { select: { members: true } } } });
  res.json({ data: { ...workspace, role: req.membership.role } });
}));
router.patch('/:workspaceId', requireWorkspace('ADMIN'), validate(workspaceSchema), asyncHandler(async (req, res) => {
  const workspace = await prisma.workspace.update({ where: { id: req.params.workspaceId }, data: { name: req.body.name } });
  res.json({ data: workspace });
}));
router.delete('/:workspaceId', requireWorkspace('OWNER'), asyncHandler(async (req, res) => { await prisma.workspace.delete({ where: { id: req.params.workspaceId } }); res.status(204).end(); }));

router.get('/:workspaceId/members', requireWorkspace(), asyncHandler(async (req, res) => {
  const members = await prisma.workspaceMember.findMany({ where: { workspaceId: req.params.workspaceId }, include: { user: { select: { id: true, name: true, email: true, createdAt: true } } }, orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }] });
  res.json({ data: members });
}));
router.patch('/:workspaceId/members/:memberId', requireWorkspace('ADMIN'), asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!['ADMIN','MEMBER','VIEWER'].includes(role)) throw forbidden('This role cannot be assigned.');
  const target = await prisma.workspaceMember.findFirst({ where: { id: req.params.memberId, workspaceId: req.params.workspaceId } });
  if (!target) throw notFound('Member');
  if (target.role === 'OWNER' || (role === 'ADMIN' && req.membership.role !== 'OWNER')) throw forbidden();
  const member = await prisma.workspaceMember.update({ where: { id: target.id }, data: { role } });
  res.json({ data: member });
}));
router.delete('/:workspaceId/members/:memberId', requireWorkspace('ADMIN'), asyncHandler(async (req, res) => {
  const target = await prisma.workspaceMember.findFirst({ where: { id: req.params.memberId, workspaceId: req.params.workspaceId } });
  if (!target) throw notFound('Member');
  if (target.role === 'OWNER' || (target.role === 'ADMIN' && req.membership.role !== 'OWNER')) throw forbidden();
  await prisma.$transaction([prisma.workspaceMember.delete({ where: { id: target.id } }), prisma.activityLog.create({ data: activityData(req.params.workspaceId, req.user.id, 'MEMBER_REMOVED', 'member', target.id, { userId: target.userId }) })]);
  res.status(204).end();
}));

router.post('/:workspaceId/invitations', requireWorkspace('ADMIN'), validate(invitationSchema), asyncHandler(async (req, res) => {
  if (req.body.role === 'ADMIN' && req.membership.role !== 'OWNER') throw forbidden('Only owners can invite administrators.');
  const existingUser = await prisma.user.findUnique({ where: { email: req.body.email } });
  if (existingUser && await prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId: existingUser.id, workspaceId: req.params.workspaceId } } })) throw conflict('This user is already a workspace member.');
  const token = crypto.randomBytes(32).toString('hex');
  const invitation = await prisma.$transaction(async (tx) => {
    await tx.workspaceInvitation.updateMany({ where: { workspaceId: req.params.workspaceId, email: req.body.email, status: 'PENDING' }, data: { status: 'REVOKED', respondedAt: new Date() } });
    const created = await tx.workspaceInvitation.create({ data: { email: req.body.email, role: req.body.role, workspaceId: req.params.workspaceId, invitedById: req.user.id, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + req.body.expiresInDays * 86400000) } });
    await tx.activityLog.create({ data: activityData(req.params.workspaceId, req.user.id, 'MEMBER_INVITED', 'invitation', created.id, { email: created.email, role: created.role }) });
    return created;
  });
  res.status(201).json({ data: { ...invitation, token: undefined, inviteUrl: `${process.env.CLIENT_URL}/invite/${token}` } });
}));
router.get('/:workspaceId/activity', requireWorkspace(), asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const [items, total] = await prisma.$transaction([prisma.activityLog.findMany({ where: { workspaceId: req.params.workspaceId }, include: { actor: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, skip: (page-1)*limit, take: limit }), prisma.activityLog.count({ where: { workspaceId: req.params.workspaceId } })]);
  res.json({ data: items, pagination: { page, limit, total, pages: Math.ceil(total/limit) } });
}));
export default router;

