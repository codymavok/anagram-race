import { describe, expect, it } from 'vitest';
import { getDictionary, loadSeeds, solutionsFor, sortKey } from './dictionary.js';
import { generatePuzzle, isPlayable } from './puzzles.js';

const dict = getDictionary();
const seeds = loadSeeds();

describe('dictionary index', () => {
  it('sorts keys and finds anagram groups', () => {
    expect(sortKey('parcel')).toBe('acelpr');
    const sols = solutionsFor(dict, 'parcel');
    expect(sols).toContain('parcel');
    expect(sols).toContain('placer');
    expect(sols).toContain('clear');
    expect(sols.every((w) => w.length >= 3 && w.length <= 6)).toBe(true);
  });
});

describe('puzzle generation', () => {
  it('every generated puzzle has a 6-letter solution and 25+ words (100 samples)', () => {
    for (let i = 0; i < 100; i++) {
      const p = generatePuzzle(dict, seeds);
      expect(p.letters).toHaveLength(6);
      expect(p.solutions.some((w) => w.length === 6)).toBe(true);
      expect(p.solutions.length).toBeGreaterThanOrEqual(25);
      expect(isPlayable(p.letters, p.solutions)).toBe(true);
      expect(sortKey(p.letters)).toBe(sortKey(p.seed));
    }
  });
  it('every seed is in the dictionary', () => {
    expect(seeds.every((s) => s.length === 6 && dict.words.has(s))).toBe(true);
  });
});
