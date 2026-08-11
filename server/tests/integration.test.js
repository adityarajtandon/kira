import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/config/prisma.js';

const agentFor = async (email, name='Test User') => { const agent = request.agent(app); await agent.post('/api/auth/register').send({ name, email, password: 'strong-password' }).expect(201); return agent; };
describe('Kira API integration', () => {
  test('registers, rejects duplicates, logs in, and protects endpoints', async () => {
    await request(app).get('/api/workspaces').expect(401);
    await request(app).post('/api/auth/register').send({ name:'Ada', email:'ada@test.dev', password:'strong-password' }).expect(201);
    await request(app).post('/api/auth/register').send({ name:'Ada', email:'ada@test.dev', password:'strong-password' }).expect(409);
    await request(app).post('/api/auth/login').send({ email:'ada@test.dev', password:'wrong-password' }).expect(401);
    await request(app).post('/api/auth/login').send({ email:'ada@test.dev', password:'strong-password' }).expect(200);
  });
  test('workspace creation atomically creates owner membership and activity', async () => {
    const agent = await agentFor('owner@test.dev'); const response = await agent.post('/api/workspaces').send({ name:'Acme' }).expect(201);
    expect((await prisma.workspaceMember.findFirst({ where:{ workspaceId:response.body.data.id } })).role).toBe('OWNER');
    expect(await prisma.activityLog.count({ where:{ workspaceId:response.body.data.id, action:'WORKSPACE_CREATED' } })).toBe(1);
    const invalidProject = await agent.post(`/api/workspaces/${response.body.data.id}/projects`).send({ name:'Invalid key', key:'1' }).expect(400);
    expect(invalidProject.body.error.message).toBe('Project key must be 2–8 characters, start with a letter, and contain only letters and numbers.');
  });
  test('outsider cannot access a known task id and viewer cannot mutate', async () => {
    const owner = await agentFor('owner@test.dev'); const outsider = await agentFor('outsider@test.dev'); const viewer = await agentFor('viewer@test.dev');
    const workspace = (await owner.post('/api/workspaces').send({ name:'Private' })).body.data;
    const project = (await owner.post(`/api/workspaces/${workspace.id}/projects`).send({ name:'App', key:'APP' })).body.data;
    const task = (await owner.post(`/api/projects/${project.id}/tasks`).send({ title:'Secret task', stageId:project.stages[0].id, priority:'HIGH' })).body.data;
    await outsider.get(`/api/tasks/${task.id}`).expect(403);
    const viewerUser = await prisma.user.findUnique({ where:{ email:'viewer@test.dev' } }); await prisma.workspaceMember.create({ data:{ userId:viewerUser.id, workspaceId:workspace.id, role:'VIEWER' } });
    await viewer.get(`/api/tasks/${task.id}`).expect(200); await viewer.patch(`/api/tasks/${task.id}`).send({ title:'Nope' }).expect(403);
  });
  test('filters and paginates tasks and validates assignment', async () => {
    const owner = await agentFor('tasks@test.dev'); const workspace = (await owner.post('/api/workspaces').send({ name:'Tasks' })).body.data; const project = (await owner.post(`/api/workspaces/${workspace.id}/projects`).send({ name:'Core', key:'CORE' })).body.data;
    await owner.post(`/api/projects/${project.id}/tasks`).send({ title:'Urgent API', stageId:project.stages[0].id, priority:'URGENT' }).expect(201);
    await owner.post(`/api/projects/${project.id}/tasks`).send({ title:'Low docs', stageId:project.stages[0].id, priority:'LOW' }).expect(201);
    const list = await owner.get(`/api/projects/${project.id}/tasks?priority=URGENT&page=1&limit=1&sortBy=createdAt&order=asc`).expect(200); expect(list.body.data).toHaveLength(1); expect(list.body.pagination.total).toBe(1);
    await owner.post(`/api/projects/${project.id}/tasks`).send({ title:'Bad assignment', stageId:project.stages[0].id, assigneeId:'00000000-0000-0000-0000-000000000000' }).expect(400);
  });
  test('accepts a valid invitation once and rejects expired invitations', async () => {
    const owner = await agentFor('invite-owner@test.dev');
    const invited = await agentFor('invited@test.dev');
    const workspace = (await owner.post('/api/workspaces').send({ name:'Invites' })).body.data;
    const created = await owner.post(`/api/workspaces/${workspace.id}/invitations`).send({ email:'invited@test.dev', role:'MEMBER', expiresInDays:7 }).expect(201);
    const token = created.body.data.inviteUrl.split('/').pop();
    await invited.post(`/api/invitations/${token}/accept`).expect(200);
    await invited.post(`/api/invitations/${token}/accept`).expect(409);
    expect(await prisma.workspaceMember.count({ where:{ workspaceId:workspace.id, user:{ email:'invited@test.dev' } } })).toBe(1);
    expect(await prisma.activityLog.count({ where:{ workspaceId:workspace.id, action:'INVITATION_ACCEPTED' } })).toBe(1);

    const expired = await owner.post(`/api/workspaces/${workspace.id}/invitations`).send({ email:'expired@test.dev', role:'VIEWER', expiresInDays:1 }).expect(201);
    await agentFor('expired@test.dev');
    await prisma.workspaceInvitation.update({ where:{ id:expired.body.data.id }, data:{ expiresAt:new Date(Date.now()-1000) } });
    const expiredToken = expired.body.data.inviteUrl.split('/').pop();
    const expiredAgent = await request.agent(app).post('/api/auth/login').send({ email:'expired@test.dev', password:'strong-password' });
    await request(app).post(`/api/invitations/${expiredToken}/accept`).set('Cookie', expiredAgent.headers['set-cookie']).expect(409);
  });
  test('member cannot manage projects and admin cannot delete the workspace', async () => {
    const owner = await agentFor('roles-owner@test.dev');
    const member = await agentFor('member@test.dev');
    const admin = await agentFor('admin@test.dev');
    const workspace = (await owner.post('/api/workspaces').send({ name:'Roles' })).body.data;
    const [memberUser,adminUser] = await Promise.all([prisma.user.findUnique({where:{email:'member@test.dev'}}),prisma.user.findUnique({where:{email:'admin@test.dev'}})]);
    await prisma.workspaceMember.createMany({ data:[{userId:memberUser.id,workspaceId:workspace.id,role:'MEMBER'},{userId:adminUser.id,workspaceId:workspace.id,role:'ADMIN'}] });
    await member.post(`/api/workspaces/${workspace.id}/projects`).send({ name:'Forbidden',key:'NO' }).expect(403);
    await admin.post(`/api/workspaces/${workspace.id}/projects`).send({ name:'Allowed',key:'YES' }).expect(201);
    await admin.delete(`/api/workspaces/${workspace.id}`).expect(403);
  });
});
