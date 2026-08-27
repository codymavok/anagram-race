/** Points table — fixed, matches the game this is modeled on. */
export const POINTS: Readonly<Record<number, number>> = { 3: 100, 4: 400, 5: 1200, 6: 2000 };
export const MIN_WORD_LENGTH = 3;
export const MAX_WORD_LENGTH = 6;

/** Returns points for a word, or 0 if its length is outside 3..6. */
export function scoreWord(word: string): number {
  return POINTS[word.length] ?? 0;
}
