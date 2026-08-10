import 'dotenv/config';
import http from 'node:http';
import { Server } from 'socket.io';
import app from './app.js';
import { configureSockets } from './socket.js';

const server = http.createServer(app);
const origins = process.env.CLIENT_URL?.split(',').map((url) => url.trim());
const io = new Server(server, { cors: { origin: origins, credentials: true } });
app.set('io', io); configureSockets(io);
const port = Number(process.env.PORT) || 4000;
server.listen(port, () => console.log(`Kira API listening on port ${port}`));

