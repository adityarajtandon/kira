import 'dotenv/config';
import { prisma } from '../src/config/prisma.js';
beforeEach(async () => {
  await prisma.$transaction([
    prisma.comment.deleteMany(), prisma.activityLog.deleteMany(), prisma.task.deleteMany(), prisma.workflowStage.deleteMany(), prisma.project.deleteMany(), prisma.workspaceInvitation.deleteMany(), prisma.workspaceMember.deleteMany(), prisma.workspace.deleteMany(), prisma.user.deleteMany(),
  ]);
});
afterAll(async () => prisma.$disconnect());

