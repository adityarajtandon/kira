# Kira

Kira is a production-style collaborative project-management platform inspired by Linear and Jira. It gives teams isolated workspaces, configurable projects and workflows, queryable task boards, threaded discussion, auditable activity, secure invitations, and real-time updates.

> Portfolio project: deployment URLs and screenshots are intentionally not fabricated.

## Features

- Secure registration, login, logout, and profile sessions using JWTs in HTTP-only cookies
- Multi-workspace membership with `OWNER`, `ADMIN`, `MEMBER`, and `VIEWER` roles
- Expiring, one-use invitation links with accept/reject flows
- Projects with five default stages and configurable workflow stages
- Task creation, editing, deletion, assignment, due dates, priorities, stage movement, search, filters, sorting, and pagination
- Threaded comments with author editing and administrator moderation
- Workspace and project activity history with structured metadata
- Socket.IO workspace rooms for committed task and comment events
- Responsive SaaS interface with robust loading, empty, and error states
- Prisma constraints/indexes, Zod validation, integration tests, and CI

## Architecture

```text
Kira/
├── client/                 React + Vite application
│   └── src/
│       ├── components/     Shared interface primitives
│       ├── context/        Authentication state
│       ├── lib/            Fetch/API client
│       └── pages/          Landing, auth, dashboard, board, settings, invite
├── server/                 Express API + Socket.IO
│   ├── prisma/             PostgreSQL schema
│   ├── src/
│   │   ├── config/         Prisma client
│   │   ├── middleware/     Auth, authorization, validation, error handling
│   │   ├── routes/         REST API modules
│   │   ├── services/       Resource access and workspace isolation
│   │   ├── utils/          Errors, async handling, activity helpers
│   │   └── validators/     Zod request schemas
│   └── tests/              Jest/Supertest integration suite
└── .github/workflows/      PostgreSQL-backed CI
```

The browser talks to the Express REST API with credentialed requests. Express verifies the JWT, resolves the current user, then resource-aware services verify workspace membership before any scoped data is read. PostgreSQL remains the source of truth; Socket.IO only broadcasts events after writes commit.

## Tech stack

| Surface | Technology |
| --- | --- |
| Frontend | React 19, Vite, React Router, Tailwind CSS, Lucide |
| Backend | Node.js, Express, Zod, JWT, bcrypt, Socket.IO |
| Data | PostgreSQL, Prisma ORM |
| Testing | Jest, Supertest |
| Delivery | GitHub Actions, Vercel-ready client, Render-ready server |

## Data model

`WorkspaceMember` is the normalized many-to-many join between users and workspaces and owns the member role. Projects belong to one workspace; stages belong to one project; tasks belong to one project and stage. Assignees are nullable. Comments use a self-relation (`parentCommentId`) for replies. Invitations store a SHA-256 token digest, never the raw bearer token. Activity records are workspace-scoped with optional project/task references and structured JSON metadata.

Database uniqueness protects email, workspace slug, membership, project key per workspace, stage position per project, task number per project, and invitation token hash. Task indexes cover stage, priority, assignee, due date, and created date queries.

## Permission matrix

| Capability | Owner | Admin | Member | Viewer |
| --- | :---: | :---: | :---: | :---: |
| Read workspace/project/task/comment | ✓ | ✓ | ✓ | ✓ |
| Create tasks and comments | ✓ | ✓ | ✓ | — |
| Edit any task | ✓ | ✓ | — | — |
| Edit own/assigned task | ✓ | ✓ | ✓ | — |
| Moderate comments | ✓ | ✓ | Own | — |
| Manage projects/workflows | ✓ | ✓ | — | — |
| Invite/remove ordinary members | ✓ | ✓ | — | — |
| Manage administrators | ✓ | — | — | — |
| Delete workspace/remove owner | ✓ | — | — | — |

All checks run on the server. The client may hide unavailable controls for clarity, but it is never an authorization boundary. An explicit integration test proves an outsider cannot read a task even with its UUID.

## API overview

All JSON responses use `{ "data": ... }`; paginated lists also return `pagination`. Errors use `{ "error": { "code", "message" } }`.

- `/api/auth` — register, login, logout, current profile
- `/api/workspaces` — list/create/read/update/delete, members, invitations, activity
- `/api/invitations/:token` — inspect, accept, reject
- `/api/projects` — project details and workflow stages
- `/api/projects/:projectId/tasks` — server-side task list/create
- `/api/tasks/:taskId` — isolated task detail/update/delete
- `/api/tasks/:taskId/comments` — comment threads

## Local development

Prerequisites: Node.js 20+, npm, and PostgreSQL 15+.

```bash
npm install
cp server/.env.example server/.env
cp client/.env.example client/.env
npm run db:generate
npm run prisma:migrate -w server -- --name init
npm run dev
```

The client runs on `http://localhost:5173`; the API runs on `http://localhost:4000`.

### Environment variables

| Variable | Location | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | server | PostgreSQL connection URL |
| `JWT_SECRET` | server | At least 32 random characters |
| `CLIENT_URL` | server | Allowed credentialed CORS origin(s) |
| `PORT` | server | API listener; Render supplies this |
| `NODE_ENV` | server | Cookie/security behavior |
| `VITE_API_URL` | client | Public API base ending in `/api` |

Never commit real `.env` files.

## Testing and isolated database

Tests expect a disposable PostgreSQL database through `DATABASE_URL`. They truncate all Kira tables before each test; never point tests at development or production data.

```bash
createdb kira_test
DATABASE_URL=postgresql://localhost:5432/kira_test npm run prisma:deploy -w server
DATABASE_URL=postgresql://localhost:5432/kira_test JWT_SECRET=test-secret-at-least-32-characters CLIENT_URL=http://localhost:5173 npm test
```

The integration suite exercises authentication, role enforcement, workspace creation transactions, cross-workspace task isolation, project/task operations, query filters, pagination, and assignment validation.

## CI

GitHub Actions starts PostgreSQL 16, installs the locked dependency graph, generates Prisma Client, applies migrations, and runs backend tests. The workflow uses a dedicated ephemeral database service.

## Deployment

### Database (Supabase or standard PostgreSQL)

Create a database, copy its pooled connection string to the backend `DATABASE_URL`, then run `npm run prisma:deploy -w server` in the release step.

### Backend (Render)

Create a Web Service using the repository root:

- Build: `npm install && npm run prisma:generate -w server`
- Pre-deploy: `npm run prisma:deploy -w server`
- Start: `npm start -w server`
- Set `DATABASE_URL`, a strong `JWT_SECRET`, `CLIENT_URL`, and `NODE_ENV=production`

### Frontend (Vercel)

Import the repository, set Root Directory to `client`, use Vite defaults, and set `VITE_API_URL=https://<your-render-service>/api`. Add a rewrite to `index.html` for SPA routes (included in `client/vercel.json`). Update backend `CLIENT_URL` to the final Vercel origin.

Production uses cross-site `Secure; HttpOnly; SameSite=None` cookies, an exact CORS allowlist, Helmet response headers, input size limits, bcrypt cost 12, hashed invitation tokens, and centralized safe errors.

## Real-time design

Socket clients authenticate with the same JWT cookie. Joining `workspace:<workspaceId>` performs a fresh membership query; knowing a room name is insufficient. REST transactions commit first, then the server emits `task:created`, `task:updated`, `task:deleted`, or `comment:created`. Clients re-read authoritative REST data after notifications.

## Screenshots

- Landing page — _add screenshot after deployment_
- Workspace overview — _add screenshot after deployment_
- Project board — _add screenshot after deployment_
- Task discussion — _add screenshot after deployment_

## Future improvements

- Email delivery adapters and invitation revocation UI
- Atomic stage reordering endpoint and archive semantics
- Task labels, saved views, notifications, and file attachments
- Cursor pagination and PostgreSQL full-text search at larger scale
- Ownership transfer and audit-log export
- E2E browser tests, accessibility automation, and observability
