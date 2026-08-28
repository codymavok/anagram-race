import { describe, expect, it } from 'vitest';
import { GRACE_MS } from '../../shared/scoring.js';
import { buildIndex } from './dictionary.js';
import { canFormFromPool, newPlayerRound, submitWord, type RoundState } from './round.js';

const dict = buildIndex(['tea', 'eat', 'seat', 'teas', 'sets', 'tees', 'state', 'tastes', 'ate', 'test']);
const isWord = (w: string) => dict.words.has(w);

// Pool has two S's and two T's, one A, one E.
const round: RoundState = { letters: 'tsatse', startsAt: 1000, endsAt: 61_000, solutions: [] };
const during = 30_000;

describe('multiset letter check', () => {
  it('accepts words within the pool counts', () => {
    expect(canFormFromPool('seat', 'tsatse')).toBe(true);
    expect(canFormFromPool('sets', 'tsatse')).toBe(true); // two S's available
  });
  it('rejects a double letter when the pool has only one', () => {
    expect(canFormFromPool('tees', 'tsatse')).toBe(false); // needs two E's, pool has one
    expect(canFormFromPool('sss', 'tsatse')).toBe(false); // three S's, pool has two
  });
  it('rejects letters absent from the pool', () => {
    expect(canFormFromPool('tax', 'tsatse')).toBe(false);
  });
});

describe('submitWord pipeline', () => {
  it('accepts a valid word and awards table points', () => {
    const p = newPlayerRound();
    expect(submitWord(round, p, isWord, 'seat', during)).toEqual({ ok: true, word: 'seat', points: 400, score: 400 });
    expect(submitWord(round, p, isWord, 'tea', during)).toMatchObject({ ok: true, points: 100, score: 500 });
    expect(submitWord(round, p, isWord, 'state', during)).toMatchObject({ ok: true, points: 1200, score: 1700 });
    expect(submitWord(round, p, isWord, 'tastes', during)).toMatchObject({ ok: true, points: 2000, score: 3700 });
    expect(p.words.map((w) => w.word)).toEqual(['seat', 'tea', 'state', 'tastes']);
  });

  it('normalizes case and whitespace', () => {
    const p = newPlayerRound();
    expect(submitWord(round, p, isWord, '  SeAt ', during)).toMatchObject({ ok: true, word: 'seat' });
  });

  it('rejects 1-2 letter words as too_short, and >6 letters', () => {
    const p = newPlayerRound();
    expect(submitWord(round, p, isWord, 'a', during)).toEqual({ ok: false, reason: 'too_short' });
    expect(submitWord(round, p, isWord, 'at', during)).toEqual({ ok: false, reason: 'too_short' });
    expect(submitWord(round, p, isWord, '', during)).toEqual({ ok: false, reason: 'too_short' });
    expect(submitWord(round, p, isWord, 'tastess', during)).toEqual({ ok: false, reason: 'too_short' });
    expect(p.score).toBe(0);
  });

  it('rejects letters not in the pool, including a second copy of a single letter', () => {
    const p = newPlayerRound();
    expect(submitWord(round, p, isWord, 'tees', during)).toEqual({ ok: false, reason: 'letters' });
    expect(submitWord(round, p, isWord, 'tax', during)).toEqual({ ok: false, reason: 'letters' });
  });

  it('rejects non-dictionary words formed from the pool', () => {
    const p = newPlayerRound();
    expect(submitWord(round, p, isWord, 'tsa', during)).toEqual({ ok: false, reason: 'not_a_word' });
  });

  it('rejects duplicates without changing score; no penalty for any rejection', () => {
    const p = newPlayerRound();
    submitWord(round, p, isWord, 'seat', during);
    expect(submitWord(round, p, isWord, 'seat', during)).toEqual({ ok: false, reason: 'duplicate' });
    submitWord(round, p, isWord, 'zzz', during);
    expect(p.score).toBe(400);
    expect(p.words).toHaveLength(1);
  });

  it('lets both players score the same word independently', () => {
    const a = newPlayerRound();
    const b = newPlayerRound();
    expect(submitWord(round, a, isWord, 'seat', during).ok).toBe(true);
    expect(submitWord(round, b, isWord, 'seat', during).ok).toBe(true);
  });

  it('enforces the time window with a 300ms grace after endsAt', () => {
    const p = newPlayerRound();
    expect(submitWord(round, p, isWord, 'seat', round.startsAt - 1)).toEqual({ ok: false, reason: 'time' });
    expect(submitWord(round, p, isWord, 'seat', round.startsAt).ok).toBe(true);
    expect(submitWord(round, p, isWord, 'tea', round.endsAt).ok).toBe(true);
    expect(submitWord(round, p, isWord, 'ate', round.endsAt + GRACE_MS).ok).toBe(true);
    expect(submitWord(round, p, isWord, 'eat', round.endsAt + GRACE_MS + 1)).toEqual({ ok: false, reason: 'time' });
    expect(GRACE_MS).toBe(300);
  });

  it('checks time before anything else', () => {
    const p = newPlayerRound();
    expect(submitWord(round, p, isWord, 'a', round.endsAt + 5000)).toEqual({ ok: false, reason: 'time' });
  });
});
