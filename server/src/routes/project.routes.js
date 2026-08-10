import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspace } from '../middleware/workspace.js';
import { validate } from '../middleware/validate.js';
import { projectSchema, stageSchema, stageReorderSchema } from '../validators/schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { activityData } from '../utils/activity.js';
import { projectAccess } from '../services/access.service.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';

const router = Router(); router.use(requireAuth);
const defaults = [ ['Backlog','#64748b'], ['Todo','#8b5cf6'], ['In Progress','#3b82f6'], ['Review','#f59e0b'], ['Completed','#22c55e'] ];
router.post('/workspaces/:workspaceId/projects', requireWorkspace('ADMIN'), validate(projectSchema), asyncHandler(async (req, res) => {
  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({ data: { ...req.body, workspaceId: req.params.workspaceId, stages: { create: defaults.map(([name,color], position) => ({ name, color, position })) } }, include: { stages: { orderBy: { position: 'asc' } } } });
    await tx.activityLog.create({ data: activityData(req.params.workspaceId, req.user.id, 'PROJECT_CREATED', 'project', created.id, { name: created.name, key: created.key }, { projectId: created.id }) }); return created;
  });
  res.status(201).json({ data: project });
}));
router.get('/projects/:projectId', asyncHandler(async (req, res) => { const { project, membership } = await projectAccess(req.user.id, req.params.projectId); res.json({ data: { ...project, role: membership.role } }); }));
router.patch('/projects/:projectId', validate(projectSchema.partial()), asyncHandler(async (req, res) => { await projectAccess(req.user.id, req.params.projectId, 'ADMIN'); const project = await prisma.project.update({ where: { id: req.params.projectId }, data: req.body }); res.json({ data: project }); }));
router.delete('/projects/:projectId', asyncHandler(async (req, res) => { await projectAccess(req.user.id, req.params.projectId, 'ADMIN'); await prisma.project.delete({ where: { id: req.params.projectId } }); res.status(204).end(); }));
router.post('/projects/:projectId/stages', validate(stageSchema), asyncHandler(async (req, res) => {
  const { project } = await projectAccess(req.user.id, req.params.projectId, 'ADMIN');
  const position = req.body.position ?? (await prisma.workflowStage.count({ where: { projectId: project.id } }));
  const stage = await prisma.workflowStage.create({ data: { ...req.body, position, projectId: project.id } }); res.status(201).json({ data: stage });
}));
router.patch('/projects/:projectId/stages/:stageId', validate(stageSchema.partial()), asyncHandler(async (req, res) => { await projectAccess(req.user.id, req.params.projectId, 'ADMIN'); const stage = await prisma.workflowStage.findFirst({ where: { id: req.params.stageId, projectId: req.params.projectId } }); if (!stage) throw notFound('Workflow stage'); const updated = await prisma.workflowStage.update({ where: { id: stage.id }, data: req.body }); res.json({ data: updated }); }));
router.put('/projects/:projectId/stages/reorder', validate(stageReorderSchema), asyncHandler(async (req, res) => {
  await projectAccess(req.user.id, req.params.projectId, 'ADMIN');
  const existing = await prisma.workflowStage.findMany({ where: { projectId: req.params.projectId }, select: { id: true } });
  if (existing.length !== req.body.stageIds.length || existing.some((stage) => !req.body.stageIds.includes(stage.id))) throw badRequest('Provide every project stage exactly once.');
  await prisma.$transaction(async (tx) => {
    for (let index=0; index<req.body.stageIds.length; index++) await tx.workflowStage.update({ where: { id: req.body.stageIds[index] }, data: { position: -(index+1) } });
    for (let index=0; index<req.body.stageIds.length; index++) await tx.workflowStage.update({ where: { id: req.body.stageIds[index] }, data: { position: index } });
  });
  const stages = await prisma.workflowStage.findMany({ where: { projectId: req.params.projectId }, orderBy: { position: 'asc' } }); res.json({ data: stages });
}));
router.delete('/projects/:projectId/stages/:stageId', asyncHandler(async (req, res) => {
  await projectAccess(req.user.id, req.params.projectId, 'ADMIN'); const stage = await prisma.workflowStage.findFirst({ where: { id: req.params.stageId, projectId: req.params.projectId }, include: { _count: { select: { tasks: true } } } }); if (!stage) throw notFound('Workflow stage'); if (stage._count.tasks) throw conflict('Move tasks out of this stage before deleting it.'); await prisma.workflowStage.delete({ where: { id: stage.id } }); res.status(204).end();
}));
export default router;
