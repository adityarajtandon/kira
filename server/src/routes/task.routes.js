import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { taskQuerySchema, taskSchema, taskUpdateSchema } from '../validators/schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { activityData } from '../utils/activity.js';
import { projectAccess, taskAccess } from '../services/access.service.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';

const router = Router(); router.use(requireAuth);
const taskInclude = { stage: true, assignee: { select: { id: true, name: true, email: true } }, creator: { select: { id: true, name: true } }, _count: { select: { comments: true } } };
const emit = (req, workspaceId, event, data) => req.app.get('io')?.to(`workspace:${workspaceId}`).emit(event, data);
async function validateRelations(project, stageId, assigneeId) {
  const stage = await prisma.workflowStage.findFirst({ where: { id: stageId, projectId: project.id } }); if (!stage) throw badRequest('Workflow stage does not belong to this project.');
  if (assigneeId) { const member = await prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId: assigneeId, workspaceId: project.workspaceId } } }); if (!member) throw badRequest('Assignee must be a workspace member.'); }
}
router.get('/projects/:projectId/tasks', validate(taskQuerySchema, 'query'), asyncHandler(async (req, res) => {
  await projectAccess(req.user.id, req.params.projectId); const { search, stageId, priority, assigneeId, sortBy, order, page, limit } = req.validatedQuery;
  const where = { projectId: req.params.projectId, ...(search && { OR: [{ title: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }] }), ...(stageId && { stageId }), ...(priority && { priority }), ...(assigneeId && { assigneeId }) };
  const [tasks,total] = await prisma.$transaction([prisma.task.findMany({ where, include: taskInclude, orderBy: { [sortBy]: order }, skip: (page-1)*limit, take: limit }), prisma.task.count({ where })]);
  res.json({ data: tasks, pagination: { page, limit, total, pages: Math.ceil(total/limit) } });
}));
router.post('/projects/:projectId/tasks', validate(taskSchema), asyncHandler(async (req, res) => {
  const { project } = await projectAccess(req.user.id, req.params.projectId, 'MEMBER'); await validateRelations(project, req.body.stageId, req.body.assigneeId);
  const task = await prisma.$transaction(async (tx) => { const counter = await tx.project.update({ where: { id: project.id }, data: { nextTaskNumber: { increment: 1 } }, select: { nextTaskNumber: true } }); const created = await tx.task.create({ data: { ...req.body, dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null, projectId: project.id, creatorId: req.user.id, number: counter.nextTaskNumber-1 }, include: taskInclude }); const logs = [activityData(project.workspaceId, req.user.id, 'TASK_CREATED', 'task', created.id, { title: created.title }, { projectId: project.id, taskId: created.id })]; if (created.assigneeId) logs.push(activityData(project.workspaceId, req.user.id, 'TASK_ASSIGNED', 'task', created.id, { from: null, to: created.assigneeId }, { projectId: project.id, taskId: created.id })); await tx.activityLog.createMany({ data: logs }); return created; });
  emit(req, project.workspaceId, 'task:created', task); res.status(201).json({ data: task });
}));
router.get('/tasks/:taskId', asyncHandler(async (req, res) => { const { task, membership } = await taskAccess(req.user.id, req.params.taskId); res.json({ data: { ...task, role: membership.role } }); }));
router.patch('/tasks/:taskId', validate(taskUpdateSchema), asyncHandler(async (req, res) => {
  const { task, membership } = await taskAccess(req.user.id, req.params.taskId, 'MEMBER'); if (membership.role === 'MEMBER' && task.creatorId !== req.user.id && task.assigneeId !== req.user.id) throw forbidden('Members may only edit tasks they created or are assigned to.');
  await validateRelations(task.project, req.body.stageId || task.stageId, req.body.assigneeId === undefined ? task.assigneeId : req.body.assigneeId);
  const changes = {}; for (const key of ['stageId','priority','assigneeId']) if (req.body[key] !== undefined && req.body[key] !== task[key]) changes[key] = { from: task[key], to: req.body[key] };
  const updated = await prisma.$transaction(async (tx) => { const value = await tx.task.update({ where: { id: task.id }, data: { ...req.body, ...(req.body.dueDate !== undefined && { dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null }) }, include: taskInclude }); const logs = Object.entries(changes).map(([field,values]) => activityData(task.project.workspaceId, req.user.id, field === 'stageId' ? 'TASK_STAGE_CHANGED' : field === 'priority' ? 'TASK_PRIORITY_CHANGED' : 'TASK_ASSIGNED', 'task', task.id, values, { projectId: task.projectId, taskId: task.id })); if (logs.length) await tx.activityLog.createMany({ data: logs }); return value; });
  emit(req, task.project.workspaceId, 'task:updated', updated); res.json({ data: updated });
}));
router.delete('/tasks/:taskId', asyncHandler(async (req, res) => { const { task, membership } = await taskAccess(req.user.id, req.params.taskId, 'MEMBER'); if (membership.role === 'MEMBER' && task.creatorId !== req.user.id) throw forbidden(); await prisma.task.delete({ where: { id: task.id } }); emit(req, task.project.workspaceId, 'task:deleted', { id: task.id, projectId: task.projectId }); res.status(204).end(); }));
export default router;
