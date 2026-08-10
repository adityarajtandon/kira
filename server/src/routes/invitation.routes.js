import { Router } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { activityData } from '../utils/activity.js';
import { conflict, forbidden, notFound } from '../utils/errors.js';

const router = Router(); router.use(requireAuth);
const invitationFor = (token) => prisma.workspaceInvitation.findUnique({ where: { tokenHash: crypto.createHash('sha256').update(token).digest('hex') }, include: { workspace: { select: { id: true, name: true } }, invitedBy: { select: { name: true } } } });
router.get('/:token', asyncHandler(async (req, res) => { const invitation = await invitationFor(req.params.token); if (!invitation) throw notFound('Invitation'); res.json({ data: { id: invitation.id, email: invitation.email, role: invitation.role, status: invitation.status, expiresAt: invitation.expiresAt, workspace: invitation.workspace, invitedBy: invitation.invitedBy } }); }));
router.post('/:token/accept', asyncHandler(async (req, res) => {
  const invitation = await invitationFor(req.params.token); if (!invitation) throw notFound('Invitation');
  if (invitation.email !== req.user.email) throw forbidden('This invitation was sent to a different email address.');
  if (invitation.status !== 'PENDING') throw conflict('This invitation has already been used.');
  if (invitation.expiresAt <= new Date()) throw conflict('This invitation has expired.');
  const membership = await prisma.$transaction(async (tx) => {
    const existing = await tx.workspaceMember.findUnique({ where: { userId_workspaceId: { userId: req.user.id, workspaceId: invitation.workspaceId } } });
    if (existing) throw conflict('You are already a workspace member.');
    const created = await tx.workspaceMember.create({ data: { userId: req.user.id, workspaceId: invitation.workspaceId, role: invitation.role } });
    await tx.workspaceInvitation.update({ where: { id: invitation.id }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
    await tx.activityLog.create({ data: activityData(invitation.workspaceId, req.user.id, 'INVITATION_ACCEPTED', 'member', created.id, { role: created.role }) });
    return created;
  });
  res.json({ data: membership });
}));
router.post('/:token/reject', asyncHandler(async (req, res) => { const invitation = await invitationFor(req.params.token); if (!invitation) throw notFound('Invitation'); if (invitation.email !== req.user.email) throw forbidden(); if (invitation.status !== 'PENDING') throw conflict('This invitation has already been used.'); await prisma.workspaceInvitation.update({ where: { id: invitation.id }, data: { status: 'REJECTED', respondedAt: new Date() } }); res.status(204).end(); }));
export default router;
