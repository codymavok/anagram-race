import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);

const app = express();
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Serve the built client (exists after `npm run build`); in dev Vite serves it instead.
const clientDist = path.resolve(__dirname, '../../../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html'), (err) => err && res.status(404).end()));

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    if (String(raw) === '{"type":"ping"}') ws.send('{"type":"pong"}');
  });
});

httpServer.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));
