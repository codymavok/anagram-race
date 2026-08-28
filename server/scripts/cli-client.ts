/**
 * Terminal client for exercising the server without a UI.
 *   npx tsx server/scripts/cli-client.ts create Ann
 *   npx tsx server/scripts/cli-client.ts join ABC123 Bob
 * Then type words + Enter during the round. Commands: /ready  /rematch  /quit
 */
import readline from 'node:readline';
import WebSocket from 'ws';
import type { ClientMessage, RoomSnapshot, ServerMessage } from '../../shared/protocol.js';

const [mode, arg1, arg2] = process.argv.slice(2);
const url = process.env.WS_URL ?? 'ws://localhost:3000/ws';
const ws = new WebSocket(url);
const send = (m: ClientMessage) => ws.send(JSON.stringify(m));
let offset = 0;

ws.on('open', () => {
  if (mode === 'create') send({ type: 'create', name: arg1 ?? 'Ann' });
  else if (mode === 'join') send({ type: 'join', code: arg1, name: arg2 ?? 'Bob' });
  else {
    console.error('usage: create <name> | join <code> <name>');
    process.exit(1);
  }
});

ws.on('message', (raw) => {
  const m = JSON.parse(String(raw)) as ServerMessage;
  switch (m.type) {
    case 'joined':
      console.log(`joined room ${m.code} as player ${m.you} (token ${m.token.slice(0, 8)}…)`);
      break;
    case 'state':
      render(m.snapshot);
      break;
    case 'accepted':
      console.log(`  ✓ ${m.word} +${m.points} → ${m.score}`);
      break;
    case 'rejected':
      console.log(`  ✗ ${m.word} (${m.reason})`);
      break;
    case 'error':
      console.log(`! ${m.code}: ${m.message}`);
      break;
  }
});
ws.on('close', () => {
  console.log('connection closed');
  process.exit(0);
});

function render(s: RoomSnapshot) {
  offset = s.serverNow - Date.now();
  const me = s.players[s.you];
  const op = s.players[1 - s.you];
  const line = `[${s.phase}] ${me?.name}: ${me?.score} (${me?.wordCount})` + (op ? ` | ${op.name}${op.connected ? '' : ' (offline)'}: ${op.score} (${op.wordCount})` : ' | waiting for opponent');
  console.log(line);
  if (s.phase === 'ready' && s.round) {
    console.log(`  letters: ${s.round.letters.toUpperCase().split('').join(' ')}  — starts in ${((s.round.startsAt - (Date.now() + offset)) / 1000).toFixed(1)}s`);
  }
  if (s.phase === 'live' && s.round) {
    console.log(`  ${s.round.letters.toUpperCase().split('').join(' ')}   ${((s.round.endsAt - (Date.now() + offset)) / 1000).toFixed(1)}s left`);
  }
  if (s.phase === 'results' && s.results) {
    const w = s.results.winner;
    console.log(`  winner: ${w === null ? 'tie' : s.players[w].name}${s.results.left !== null ? ` (${s.players[s.results.left].name} left)` : ''}`);
    s.players.forEach((p) => console.log(`  ${p.name}: ${p.words?.map((x) => `${x.word}(${x.points})`).join(' ') || '—'}`));
    console.log(`  missed: ${s.results.missed.map((x) => `${x.word}(${x.points})`).join(' ')}  [${s.results.totalSolutions} total]`);
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const t = line.trim();
  if (t === '/ready') send({ type: 'ready' });
  else if (t === '/rematch') send({ type: 'rematch' });
  else if (t === '/quit') {
    send({ type: 'leave' });
    ws.close();
  } else if (t) send({ type: 'submit', word: t });
});
