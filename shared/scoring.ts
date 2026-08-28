/** Points table — fixed, matches the game this is modeled on. */
export const POINTS: Readonly<Record<number, number>> = { 3: 100, 4: 400, 5: 1200, 6: 2000 };
export const MIN_WORD_LENGTH = 3;
export const MAX_WORD_LENGTH = 6;
export const ROUND_MS = 60_000;
export const COUNTDOWN_MS = 3_000;
/** Submissions are accepted this long after endsAt — network latency, not cheating. */
export const GRACE_MS = 300;

/** Returns points for a word, or 0 if its length is outside 3..6. */
export function scoreWord(word: string): number {
  return POINTS[word.length] ?? 0;
}

export type RejectReason = 'time' | 'too_short' | 'letters' | 'not_a_word' | 'duplicate';
