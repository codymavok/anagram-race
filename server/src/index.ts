import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../../shared/protocol.js';
import { getDictionary, loadSeeds } from './dictionary.js';
import { RoomManager, type Player, type Room } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);

const t0 = performance.now();
const dict = getDictionary();
const seeds = loadSeeds();
console.log(`[server] dictionary: ${dict.words.size} words, ${seeds.length} seeds (${(performance.now() - t0).toFixed(0)}ms)`);
const rooms = new RoomManager({ dict, seeds });
setInterval(() => rooms.sweep(), 60_000).unref();

const app = express();
app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: rooms.rooms.size }));

const clientDist = path.resolve(__dirname, '../../../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html'), (err) => err && res.status(404).end()));

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  let room: Room | null = null;
  let player: Player | null = null;
  const send = (msg: ServerMessage) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };
  const sink = { send };

  const attach = (r: Room, p: Player) => {
    room = r;
    player = p;
    send({ type: 'joined', code: r.code, token: p.token, you: r.players.indexOf(p) });
    send({ type: 'state', snapshot: rooms.snapshot(r, r.players.indexOf(p)) });
  };

  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return send({ type: 'error', code: 'bad_message', message: 'Malformed JSON' });
    }
    switch (msg.type) {
      case 'ping':
        return send({ type: 'pong', serverNow: Date.now() });
      case 'create': {
        if (room) return;
        const { room: r, player: p } = rooms.create(msg.name, sink);
        return attach(r, p);
      }
      case 'join': {
        if (room) return;
        const res = rooms.join(String(msg.code ?? ''), msg.name, sink);
        if ('error' in res) return send({ type: 'error', code: res.error, message: errorText(res.error) });
        return attach(res.room, res.player);
      }
      case 'rejoin': {
        if (room) return;
        const res = rooms.rejoin(String(msg.code ?? ''), String(msg.token ?? ''), sink);
        if ('error' in res) return send({ type: 'error', code: res.error, message: errorText(res.error) });
        return attach(res.room, res.player);
      }
      case 'ready':
        if (room && player) rooms.ready(room, player);
        return;
      case 'rematch':
        if (room && player) rooms.rematch(room, player);
        return;
      case 'submit':
        if (room && player) rooms.submit(room, player, String(msg.word ?? ''));
        return;
      case 'leave':
        if (room && player) rooms.leave(room, player);
        room = null;
        player = null;
        return;
      default:
        return send({ type: 'error', code: 'bad_message', message: 'Unknown message type' });
    }
  });

  ws.on('close', () => {
    if (room && player && player.sink === sink) rooms.disconnect(room, player);
  });
});

function errorText(code: string): string {
  switch (code) {
    case 'no_such_room':
      return 'No room with that code.';
    case 'room_full':
      return 'This room already has two players.';
    case 'room_expired':
      return 'This room has expired.';
    case 'bad_token':
      return "Couldn't rejoin this room.";
    default:
      return 'Something went wrong.';
  }
}

httpServer.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));
