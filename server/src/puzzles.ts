import { type Dictionary, solutionsFor } from './dictionary.js';

export interface Puzzle {
  /** The six letters, shuffled. */
  letters: string;
  /** The seed word the letters came from. */
  seed: string;
  /** Every valid word, length desc then alpha. */
  solutions: string[];
}

export const PUZZLE_RULES = {
  minVowels: 2,
  minWords: 25,
  minLongWords: 3, // words of length >= 5
  maxAttempts: 50,
} as const;

const VOWELS = new Set('aeiou');

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function isPlayable(letters: string, solutions: string[]): boolean {
  const vowels = [...letters].filter((c) => VOWELS.has(c)).length;
  if (vowels < PUZZLE_RULES.minVowels) return false;
  if (solutions.length < PUZZLE_RULES.minWords) return false;
  if (solutions.filter((w) => w.length >= 5).length < PUZZLE_RULES.minLongWords) return false;
  return true;
}

/**
 * Picks a seed word, shuffles it, and checks the quality rules. Re-rolls up to maxAttempts times,
 * then returns the best (most solutions) candidate seen.
 */
export function generatePuzzle(dict: Dictionary, seeds: string[], rand: () => number = Math.random): Puzzle {
  let best: Puzzle | undefined;
  for (let i = 0; i < PUZZLE_RULES.maxAttempts; i++) {
    const seed = seeds[Math.floor(rand() * seeds.length)];
    const letters = shuffle([...seed], rand).join('');
    const solutions = solutionsFor(dict, letters);
    const p = { letters, seed, solutions };
    if (isPlayable(letters, solutions)) return p;
    if (!best || solutions.length > best.solutions.length) best = p;
  }
  return best!;
}
