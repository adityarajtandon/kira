import { prisma } from '../config/prisma.js';
import { forbidden, notFound } from '../utils/errors.js';

export const ROLE_LEVEL = { VIEWER: 0, MEMBER: 1, ADMIN: 2, OWNER: 3 };
export async function getMembership(userId, workspaceId) {
  return prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId, workspaceId } }, include: { workspace: true } });
}
export const requireWorkspace = (minimumRole = 'VIEWER') => async (req, _res, next) => {
  try {
    const workspaceId = req.params.workspaceId;
    if (!workspaceId) throw notFound('Workspace');
    const membership = await getMembership(req.user.id, workspaceId);
    if (!membership) throw forbidden();
    if (ROLE_LEVEL[membership.role] < ROLE_LEVEL[minimumRole]) throw forbidden();
    req.membership = membership;
    next();
  } catch (error) { next(error); }
};

