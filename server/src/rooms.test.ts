import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerMessage } from '../../shared/protocol.js';
import { COUNTDOWN_MS, GRACE_MS, ROUND_MS } from '../../shared/scoring.js';
import { getDictionary, loadSeeds } from './dictionary.js';
import { RECONNECT_WINDOW_MS, ROOM_TTL_MS, RoomManager, type Sink } from './rooms.js';

const dict = getDictionary();
const seeds = loadSeeds();

function sink(): Sink & { msgs: ServerMessage[]; last(): ServerMessage } {
  const msgs: ServerMessage[] = [];
  return { msgs, send: (m) => msgs.push(m), last: () => msgs[msgs.length - 1] };
}
function lastState(s: ReturnType<typeof sink>) {
  const m = [...s.msgs].reverse().find((m) => m.type === 'state');
  if (!m || m.type !== 'state') throw new Error('no state');
  return m.snapshot;
}

describe('RoomManager', () => {
  let rm: RoomManager;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    rm = new RoomManager({ dict, seeds });
  });

  function twoPlayerRoom() {
    const a = sink();
    const b = sink();
    const { room, player: pa } = rm.create('Ann', a);
    const res = rm.join(room.code, 'Bob', b);
    if ('error' in res) throw new Error(res.error);
    return { room, a, b, pa, pb: res.player };
  }

  it('creates a 6-char code and rejects unknown / full rooms', () => {
    const { room } = twoPlayerRoom();
    expect(room.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(rm.join('NOPE00', 'x', sink())).toEqual({ error: 'no_such_room' });
    expect(rm.join(room.code.toLowerCase(), 'x', sink())).toEqual({ error: 'room_full' });
  });

  it('runs waiting → ready → live → results with server-owned times', () => {
    const { room, a, b, pa, pb } = twoPlayerRoom();
    expect(lastState(a).phase).toBe('waiting');
    rm.ready(room, pa);
    expect(room.phase).toBe('waiting');
    rm.ready(room, pb);
    expect(room.phase).toBe('ready');
    const snap = lastState(b);
    expect(snap.round!.startsAt).toBe(1_000_000 + COUNTDOWN_MS);
    expect(snap.round!.endsAt).toBe(1_000_000 + COUNTDOWN_MS + ROUND_MS);
    expect(snap.round!.letters).toHaveLength(6);
    vi.advanceTimersByTime(COUNTDOWN_MS);
    expect(room.phase).toBe('live');
    vi.advanceTimersByTime(ROUND_MS + GRACE_MS);
    expect(room.phase).toBe('results');
    expect(lastState(a).results).not.toBeNull();
  });

  it('scores via the pipeline, hides opponent words live, reveals them in results', () => {
    const { room, a, b, pa, pb } = twoPlayerRoom();
    rm.ready(room, pa);
    rm.ready(room, pb);
    vi.advanceTimersByTime(COUNTDOWN_MS);
    const six = room.puzzle!.seed; // guaranteed valid 6-letter word
    expect(rm.submit(room, pa, six)).toMatchObject({ ok: true, points: 2000 });
    expect(rm.submit(room, pa, six)).toEqual({ ok: false, reason: 'duplicate' });
    expect(rm.submit(room, pb, six)).toMatchObject({ ok: true, points: 2000 }); // independent pools
    expect(a.last()).toMatchObject({ type: 'state' });
    const sb = lastState(b);
    expect(sb.players[0].words).toBeUndefined(); // opponent words hidden
    expect(sb.players[0].score).toBe(2000);
    expect(sb.players[0].wordCount).toBe(1);
    expect(sb.players[1].words).toEqual([{ word: six, points: 2000 }]);
    vi.advanceTimersByTime(ROUND_MS + GRACE_MS);
    const r = lastState(b);
    expect(r.players[0].words).toEqual([{ word: six, points: 2000 }]);
    expect(r.results!.winner).toBeNull(); // tie
    expect(r.results!.missed.every((m) => m.word !== six)).toBe(true);
    expect(rm.submit(room, pa, 'cat')).toEqual({ ok: false, reason: 'time' });
  });

  it('freezes a disconnected player and marks them left after the window', () => {
    const { room, a, pa, pb } = twoPlayerRoom();
    rm.ready(room, pa);
    rm.ready(room, pb);
    vi.advanceTimersByTime(COUNTDOWN_MS);
    rm.submit(room, pa, room.puzzle!.seed);
    rm.disconnect(room, pa);
    expect(lastState(sinkOf(pb)).players[0].connected).toBe(false);
    vi.advanceTimersByTime(RECONNECT_WINDOW_MS + 1);
    expect(pa.left).toBe(true);
    vi.advanceTimersByTime(ROUND_MS);
    const r = lastState(sinkOf(pb));
    expect(r.phase).toBe('results');
    expect(r.results!.left).toBe(0);
    expect(r.players[0].score).toBe(2000); // frozen, not wiped
    expect(a.msgs.length).toBeGreaterThan(0);
  });

  it('restores a player who rejoins within 15s with score intact', () => {
    const { room, pa, pb } = twoPlayerRoom();
    rm.ready(room, pa);
    rm.ready(room, pb);
    vi.advanceTimersByTime(COUNTDOWN_MS);
    rm.submit(room, pa, room.puzzle!.seed);
    rm.disconnect(room, pa);
    vi.advanceTimersByTime(5_000);
    const a2 = sink();
    const res = rm.rejoin(room.code, pa.token, a2);
    expect('error' in res).toBe(false);
    vi.advanceTimersByTime(RECONNECT_WINDOW_MS);
    expect(pa.left).toBe(false);
    const s = lastState(a2);
    expect(s.phase).toBe('live');
    expect(s.players[0].score).toBe(2000);
    expect(rm.rejoin(room.code, 'wrong', sink())).toEqual({ error: 'bad_token' });
  });

  it('drops a player who disconnects in the lobby so the slot reopens', () => {
    const { room, pa } = twoPlayerRoom();
    rm.disconnect(room, pa);
    expect(room.players).toHaveLength(1);
    expect('error' in rm.join(room.code, 'Cy', sink())).toBe(false);
  });

  it('rematch starts a fresh round with new letters and zeroed scores', () => {
    const { room, pa, pb } = twoPlayerRoom();
    rm.ready(room, pa);
    rm.ready(room, pb);
    vi.advanceTimersByTime(COUNTDOWN_MS);
    rm.submit(room, pa, room.puzzle!.seed);
    vi.advanceTimersByTime(ROUND_MS + GRACE_MS);
    rm.rematch(room, pa);
    rm.rematch(room, pb);
    expect(room.phase).toBe('ready');
    expect(pa.round.score).toBe(0);
  });

  it('GCs rooms 10 minutes after results and reports expired', () => {
    const { room, a, pa, pb } = twoPlayerRoom();
    rm.ready(room, pa);
    rm.ready(room, pb);
    vi.advanceTimersByTime(COUNTDOWN_MS + ROUND_MS + GRACE_MS);
    expect(rm.sweep()).toBe(0);
    vi.advanceTimersByTime(ROOM_TTL_MS + 1);
    expect(rm.sweep()).toBe(1);
    expect(lastState(a).phase).toBe('expired');
    expect(rm.join(room.code, 'x', sink())).toEqual({ error: 'no_such_room' });
  });

  function sinkOf(p: { sink: Sink | null }) {
    return p.sink as ReturnType<typeof sink>;
  }
});
