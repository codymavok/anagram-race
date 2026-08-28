import { GRACE_MS, MAX_WORD_LENGTH, MIN_WORD_LENGTH, type RejectReason, scoreWord } from '../../shared/scoring.js';

export interface RoundState {
  letters: string;
  /** Epoch ms. */
  startsAt: number;
  endsAt: number;
  /** Valid words for this letter set (used for the missed-words panel). */
  solutions: string[];
}

export interface PlayerRound {
  score: number;
  /** Newest last; the client reverses for display. */
  words: { word: string; points: number; at: number }[];
}

export type SubmitResult =
  | { ok: true; word: string; points: number; score: number }
  | { ok: false; reason: RejectReason };

export function newPlayerRound(): PlayerRound {
  return { score: 0, words: [] };
}

/** Multiset check: every letter in `word` must be available in `pool`, counting repeats. */
export function canFormFromPool(word: string, pool: string): boolean {
  const counts = new Map<string, number>();
  for (const c of pool) counts.set(c, (counts.get(c) ?? 0) + 1);
  for (const c of word) {
    const n = counts.get(c) ?? 0;
    if (n === 0) return false;
    counts.set(c, n - 1);
  }
  return true;
}

export function normalizeWord(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * The submission pipeline, in the order the spec fixes:
 * time → length → letters → dictionary → duplicate. Mutates `player` on accept.
 */
export function submitWord(
  round: RoundState,
  player: PlayerRound,
  isWord: (w: string) => boolean,
  raw: string,
  now: number = Date.now(),
): SubmitResult {
  if (now < round.startsAt || now > round.endsAt + GRACE_MS) return { ok: false, reason: 'time' };

  const word = normalizeWord(raw);
  if (word.length < MIN_WORD_LENGTH || word.length > MAX_WORD_LENGTH || !/^[a-z]+$/.test(word)) {
    return { ok: false, reason: 'too_short' };
  }
  if (!canFormFromPool(word, round.letters)) return { ok: false, reason: 'letters' };
  if (!isWord(word)) return { ok: false, reason: 'not_a_word' };
  if (player.words.some((w) => w.word === word)) return { ok: false, reason: 'duplicate' };

  const points = scoreWord(word);
  player.score += points;
  player.words.push({ word, points, at: now });
  return { ok: true, word, points, score: player.score };
}
