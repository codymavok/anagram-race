import { describe, expect, it } from 'vitest';
import { POINTS, scoreWord } from './scoring.js';

describe('scoring table', () => {
  it('is exactly 100 / 400 / 1,200 / 2,000 for lengths 3..6', () => {
    expect(POINTS).toEqual({ 3: 100, 4: 400, 5: 1200, 6: 2000 });
    expect(scoreWord('cat')).toBe(100);
    expect(scoreWord('cats')).toBe(400);
    expect(scoreWord('scats')).toBe(1200);
    expect(scoreWord('scatty')).toBe(2000);
  });
  it('scores 0 outside 3..6', () => {
    expect(scoreWord('')).toBe(0);
    expect(scoreWord('a')).toBe(0);
    expect(scoreWord('at')).toBe(0);
    expect(scoreWord('seventy')).toBe(0);
  });
});
