import { randomBytes, randomUUID } from 'node:crypto';
import {
  MAX_NAME_LENGTH,
  SHOW_OPPONENT_WORDS_LIVE,
  type FoundWord,
  type Phase,
  type PlayerPublic,
  type RoomSnapshot,
  type ServerMessage,
} from '../../shared/protocol.js';
import { COUNTDOWN_MS, GRACE_MS, ROUND_MS, scoreWord as scoreOf } from '../../shared/scoring.js';
import { type Dictionary } from './dictionary.js';
import { generatePuzzle, type Puzzle } from './puzzles.js';
import { newPlayerRound, submitWord, type PlayerRound, type SubmitResult } from './round.js';

export const ROOM_TTL_MS = 10 * 60_000; // GC 10 min after the round ends
export const RECONNECT_WINDOW_MS = 15_000;
export const MISSED_WORDS_SHOWN = 12;

export interface Sink {
  send(msg: ServerMessage): void;
}

export interface Player {
  name: string;
  token: string;
  sink: Sink | null;
  ready: boolean;
  round: PlayerRound;
  /** Set when they disconnected mid-round and never came back. */
  left: boolean;
  disconnectedAt: number | null;
}

export interface Room {
  code: string;
  phase: Phase;
  players: Player[];
  puzzle: Puzzle | null;
  startsAt: number;
  endsAt: number;
  /** When the room became eligible for GC (results reached or emptied). */
  idleSince: number;
  timer: NodeJS.Timeout | null;
}

export interface RoomManagerOptions {
  dict: Dictionary;
  seeds: string[];
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => NodeJS.Timeout;
  clearTimer?: (t: NodeJS.Timeout) => void;
}

function makeCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  const bytes = randomBytes(6);
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[bytes[i] % alphabet.length];
  return s;
}

export function cleanName(raw: unknown, fallback: string): string {
  const s = String(raw ?? '').replace(/[^\w \-'.]/g, '').trim().slice(0, MAX_NAME_LENGTH);
  return s || fallback;
}

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => NodeJS.Timeout;
  private readonly clearTimer: (t: NodeJS.Timeout) => void;

  constructor(private readonly opts: RoomManagerOptions) {
    this.now = opts.now ?? Date.now;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((t) => clearTimeout(t));
  }

  // ---------- lifecycle ----------

  create(name: string, sink: Sink): { room: Room; player: Player } {
    let code = makeCode();
    while (this.rooms.has(code)) code = makeCode();
    const room: Room = {
      code,
      phase: 'waiting',
      players: [],
      puzzle: null,
      startsAt: 0,
      endsAt: 0,
      idleSince: this.now(),
      timer: null,
    };
    this.rooms.set(code, room);
    const player = this.addPlayer(room, name, sink);
    this.broadcast(room);
    return { room, player };
  }

  join(code: string, name: string, sink: Sink): { room: Room; player: Player } | { error: 'no_such_room' | 'room_full' | 'room_expired' } {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return { error: 'no_such_room' };
    if (room.phase === 'expired') return { error: 'room_expired' };
    if (room.players.length >= 2) return { error: 'room_full' };
    const player = this.addPlayer(room, name, sink);
    this.broadcast(room);
    return { room, player };
  }

  rejoin(code: string, token: string, sink: Sink): { room: Room; player: Player } | { error: 'no_such_room' | 'bad_token' | 'room_expired' } {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return { error: 'no_such_room' };
    if (room.phase === 'expired') return { error: 'room_expired' };
    const player = room.players.find((p) => p.token === token);
    if (!player) return { error: 'bad_token' };
    player.sink = sink;
    player.disconnectedAt = null;
    // Back within the window (or outside a round) → fully restored. `left` stays set if they missed the window mid-round.
    this.broadcast(room);
    return { room, player };
  }

  private addPlayer(room: Room, name: string, sink: Sink): Player {
    const player: Player = {
      name: cleanName(name, `Player ${room.players.length + 1}`),
      token: randomUUID(),
      sink,
      ready: false,
      round: newPlayerRound(),
      left: false,
      disconnectedAt: null,
    };
    room.players.push(player);
    return player;
  }

  disconnect(room: Room, player: Player): void {
    player.sink = null;
    player.disconnectedAt = this.now();
    if (room.phase === 'live') {
      // Score is frozen where it is. If they don't come back within the window, mark them as left.
      this.setTimer(() => {
        if (player.sink === null && room.phase === 'live') player.left = true;
        this.broadcast(room);
      }, RECONNECT_WINDOW_MS);
    } else if (room.phase === 'waiting' || room.phase === 'ready') {
      // Not committed to a round yet: drop them so someone else can take the slot.
      room.players = room.players.filter((p) => p !== player);
      if (room.phase === 'ready') this.cancelCountdown(room);
      if (room.players.length === 0) room.idleSince = this.now();
    }
    this.broadcast(room);
  }

  leave(room: Room, player: Player): void {
    if (room.phase === 'live') {
      player.left = true;
      player.sink = null;
    } else {
      room.players = room.players.filter((p) => p !== player);
      if (room.phase === 'ready') this.cancelCountdown(room);
      if (room.phase === 'results' && room.players.length === 1) {
        // Opponent is gone; the remaining player can't rematch. Reset so they can invite someone else.
        room.phase = 'waiting';
        room.players[0].ready = false;
      }
      if (room.players.length === 0) room.idleSince = this.now();
    }
    this.broadcast(room);
  }

  // ---------- round flow ----------

  ready(room: Room, player: Player): void {
    if (room.phase !== 'waiting') return;
    player.ready = true;
    if (room.players.length === 2 && room.players.every((p) => p.ready && p.sink)) this.startCountdown(room);
    else this.broadcast(room);
  }

  rematch(room: Room, player: Player): void {
    if (room.phase !== 'results') return;
    player.ready = true;
    if (room.players.length === 2 && room.players.every((p) => p.ready && p.sink)) this.startCountdown(room);
    else this.broadcast(room);
  }

  private startCountdown(room: Room): void {
    const puzzle = generatePuzzle(this.opts.dict, this.opts.seeds);
    room.puzzle = puzzle;
    room.phase = 'ready';
    room.startsAt = this.now() + COUNTDOWN_MS;
    room.endsAt = room.startsAt + ROUND_MS;
    for (const p of room.players) {
      p.round = newPlayerRound();
      p.ready = false;
      p.left = false;
    }
    this.broadcast(room);
    room.timer = this.setTimer(() => this.goLive(room), COUNTDOWN_MS);
  }

  private cancelCountdown(room: Room): void {
    if (room.timer) this.clearTimer(room.timer);
    room.timer = null;
    room.phase = 'waiting';
    room.puzzle = null;
    for (const p of room.players) p.ready = false;
  }

  private goLive(room: Room): void {
    room.phase = 'live';
    this.broadcast(room);
    room.timer = this.setTimer(() => this.finish(room), ROUND_MS + GRACE_MS);
  }

  private finish(room: Room): void {
    room.timer = null;
    room.phase = 'results';
    room.idleSince = this.now();
    for (const p of room.players) p.ready = false;
    this.broadcast(room);
  }

  submit(room: Room, player: Player, raw: string): SubmitResult {
    if (room.phase !== 'live' || !room.puzzle || player.left) return { ok: false, reason: 'time' };
    const result = submitWord(
      { letters: room.puzzle.letters, startsAt: room.startsAt, endsAt: room.endsAt, solutions: room.puzzle.solutions },
      player.round,
      (w) => this.opts.dict.words.has(w),
      raw,
      this.now(),
    );
    if (result.ok) {
      player.sink?.send({ type: 'accepted', word: result.word, points: result.points, score: result.score });
      this.broadcast(room);
    } else {
      player.sink?.send({ type: 'rejected', word: raw, reason: result.reason });
    }
    return result;
  }

  // ---------- GC ----------

  /** Expire rooms idle past the TTL. Call periodically. */
  sweep(): number {
    let n = 0;
    const now = this.now();
    for (const [code, room] of this.rooms) {
      const idle = room.players.length === 0 || room.phase === 'results' || room.phase === 'waiting';
      const allGone = room.players.every((p) => p.sink === null);
      if ((idle && now - room.idleSince > ROOM_TTL_MS) || (allGone && room.players.length > 0 && now - room.idleSince > ROOM_TTL_MS)) {
        if (room.timer) this.clearTimer(room.timer);
        room.phase = 'expired';
        this.broadcast(room);
        this.rooms.delete(code);
        n++;
      }
    }
    return n;
  }

  // ---------- views ----------

  snapshot(room: Room, forIndex: number): RoomSnapshot {
    const results = room.phase === 'results' && room.puzzle ? this.results(room) : null;
    const players: PlayerPublic[] = room.players.map((p, i) => {
      const words: FoundWord[] = p.round.words.map((w) => ({ word: w.word, points: w.points }));
      const show = i === forIndex || room.phase === 'results' || SHOW_OPPONENT_WORDS_LIVE;
      return {
        name: p.name,
        connected: p.sink !== null,
        score: p.round.score,
        wordCount: p.round.words.length,
        ...(show ? { words } : {}),
      };
    });
    return {
      code: room.code,
      phase: room.phase,
      you: forIndex,
      players,
      round: room.puzzle && room.phase !== 'waiting' ? { letters: room.puzzle.letters, startsAt: room.startsAt, endsAt: room.endsAt } : null,
      results,
      serverNow: this.now(),
    };
  }

  private results(room: Room) {
    const [a, b] = room.players;
    const sa = a?.round.score ?? 0;
    const sb = b?.round.score ?? 0;
    const winner = room.players.length < 2 ? 0 : sa === sb ? null : sa > sb ? 0 : 1;
    const found = new Set(room.players.flatMap((p) => p.round.words.map((w) => w.word)));
    const missed = room
      .puzzle!.solutions.filter((w) => !found.has(w))
      .slice(0, MISSED_WORDS_SHOWN)
      .map((word) => ({ word, points: scoreOf(word) }));
    const leftIdx = room.players.findIndex((p) => p.left);
    return { winner, missed, totalSolutions: room.puzzle!.solutions.length, left: leftIdx === -1 ? null : leftIdx };
  }

  broadcast(room: Room): void {
    room.players.forEach((p, i) => p.sink?.send({ type: 'state', snapshot: this.snapshot(room, i) }));
  }
}
