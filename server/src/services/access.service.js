import { prisma } from '../config/prisma.js';
import { forbidden, notFound } from '../utils/errors.js';
import { ROLE_LEVEL } from '../middleware/workspace.js';

export async function projectAccess(userId, projectId, minimumRole = 'VIEWER') {
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { workspace: true, stages: { orderBy: { position: 'asc' } } } });
  if (!project) throw notFound('Project');
  const membership = await prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId, workspaceId: project.workspaceId } } });
  if (!membership || ROLE_LEVEL[membership.role] < ROLE_LEVEL[minimumRole]) throw forbidden();
  return { project, membership };
}
export async function taskAccess(userId, taskId, minimumRole = 'VIEWER') {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { project: true, stage: true, assignee: { select: { id: true, name: true, email: true } }, creator: { select: { id: true, name: true } } } });
  if (!task) throw notFound('Task');
  const membership = await prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId, workspaceId: task.project.workspaceId } } });
  if (!membership || ROLE_LEVEL[membership.role] < ROLE_LEVEL[minimumRole]) throw forbidden();
  return { task, membership };
}
