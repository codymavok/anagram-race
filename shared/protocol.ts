import type { RejectReason } from './scoring.js';

export type Phase = 'waiting' | 'ready' | 'live' | 'results' | 'expired';

/** During a live round the opponent sees only score + word count. Flip to true to reveal words live. */
export const SHOW_OPPONENT_WORDS_LIVE = false;

export interface FoundWord {
  word: string;
  points: number;
}

export interface PlayerPublic {
  name: string;
  connected: boolean;
  score: number;
  wordCount: number;
  /** Only populated for yourself during the round, and for both players in results. */
  words?: FoundWord[];
}

export interface RoundInfo {
  letters: string;
  startsAt: number;
  endsAt: number;
}

export interface ResultsInfo {
  /** 0 or 1 = index into players; null = tie. */
  winner: number | null;
  /** Highest-scoring solutions nobody found, best first. */
  missed: FoundWord[];
  totalSolutions: number;
  /** Player index that left mid-round, if any. */
  left: number | null;
}

/** Full view of the room for one player. Sent on every state change — the client just renders it. */
export interface RoomSnapshot {
  code: string;
  phase: Phase;
  /** Your index into players. */
  you: number;
  players: PlayerPublic[];
  round: RoundInfo | null;
  results: ResultsInfo | null;
  /** Server epoch ms at send time — the client derives its clock offset from this. */
  serverNow: number;
}

export type ClientMessage =
  | { type: 'create'; name: string }
  | { type: 'join'; code: string; name: string }
  | { type: 'rejoin'; code: string; token: string }
  | { type: 'ready' }
  | { type: 'submit'; word: string }
  | { type: 'rematch' }
  | { type: 'leave' }
  | { type: 'ping' };

export type ServerErrorCode = 'no_such_room' | 'room_full' | 'room_expired' | 'bad_token' | 'bad_message';

export type ServerMessage =
  | { type: 'joined'; code: string; token: string; you: number }
  | { type: 'state'; snapshot: RoomSnapshot }
  | { type: 'accepted'; word: string; points: number; score: number }
  | { type: 'rejected'; word: string; reason: RejectReason }
  | { type: 'error'; code: ServerErrorCode; message: string }
  | { type: 'pong'; serverNow: number };

export const MAX_NAME_LENGTH = 16;
