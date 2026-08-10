import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { commentSchema } from '../validators/schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { activityData } from '../utils/activity.js';
import { taskAccess } from '../services/access.service.js';
import { forbidden, notFound, badRequest } from '../utils/errors.js';

const router = Router(); router.use(requireAuth);
const include = { author: { select: { id: true, name: true, email: true } }, replies: { include: { author: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'asc' } } };
router.get('/tasks/:taskId/comments', asyncHandler(async (req, res) => { await taskAccess(req.user.id, req.params.taskId); const comments = await prisma.comment.findMany({ where: { taskId: req.params.taskId, parentCommentId: null }, include, orderBy: { createdAt: 'asc' } }); res.json({ data: comments }); }));
router.post('/tasks/:taskId/comments', validate(commentSchema), asyncHandler(async (req, res) => {
  const { task } = await taskAccess(req.user.id, req.params.taskId, 'MEMBER'); if (req.body.parentCommentId) { const parent = await prisma.comment.findFirst({ where: { id: req.body.parentCommentId, taskId: task.id } }); if (!parent) throw badRequest('Parent comment does not belong to this task.'); }
  const comment = await prisma.$transaction(async (tx) => { const value = await tx.comment.create({ data: { ...req.body, taskId: task.id, authorId: req.user.id }, include: { author: { select: { id: true, name: true, email: true } } } }); await tx.activityLog.create({ data: activityData(task.project.workspaceId, req.user.id, 'COMMENT_CREATED', 'comment', value.id, {}, { projectId: task.projectId, taskId: task.id }) }); return value; }); req.app.get('io')?.to(`workspace:${task.project.workspaceId}`).emit('comment:created', comment); res.status(201).json({ data: comment });
}));
router.patch('/comments/:commentId', validate(commentSchema.pick({ body: true })), asyncHandler(async (req, res) => { const comment = await prisma.comment.findUnique({ where: { id: req.params.commentId }, include: { task: { include: { project: true } } } }); if (!comment) throw notFound('Comment'); const { membership } = await taskAccess(req.user.id, comment.taskId, 'MEMBER'); if (comment.authorId !== req.user.id && !['OWNER','ADMIN'].includes(membership.role)) throw forbidden(); const updated = await prisma.comment.update({ where: { id: comment.id }, data: { body: req.body.body }, include: { author: { select: { id: true, name: true, email: true } } } }); res.json({ data: updated }); }));
router.delete('/comments/:commentId', asyncHandler(async (req, res) => { const comment = await prisma.comment.findUnique({ where: { id: req.params.commentId } }); if (!comment) throw notFound('Comment'); const { membership } = await taskAccess(req.user.id, comment.taskId, 'MEMBER'); if (comment.authorId !== req.user.id && !['OWNER','ADMIN'].includes(membership.role)) throw forbidden(); await prisma.comment.delete({ where: { id: comment.id } }); res.status(204).end(); }));
export default router;
