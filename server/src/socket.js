import jwt from 'jsonwebtoken';
import cookie from 'cookie';
import { prisma } from './config/prisma.js';

export function configureSockets(io) {
  io.use(async (socket, next) => {
    try {
      const cookies = cookie.parse(socket.handshake.headers.cookie || '');
      const raw = cookies.kira_token || socket.handshake.auth?.token;
      const payload = jwt.verify(raw, process.env.JWT_SECRET);
      socket.userId = payload.sub;
      next();
    } catch { next(new Error('UNAUTHORIZED')); }
  });
  io.on('connection', (socket) => {
    socket.on('workspace:join', async (workspaceId, acknowledge = () => {}) => {
      const member = await prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId: socket.userId, workspaceId } } });
      if (!member) return acknowledge({ ok: false, error: 'FORBIDDEN' });
      await socket.join(`workspace:${workspaceId}`); acknowledge({ ok: true });
    });
    socket.on('workspace:leave', (workspaceId) => socket.leave(`workspace:${workspaceId}`));
  });
}

