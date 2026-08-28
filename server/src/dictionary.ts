import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Dictionary {
  /** O(1) membership. */
  words: Set<string>;
  /** sorted-letter key (e.g. "aelpp") → every word with exactly those letters. */
  byKey: Map<string, string[]>;
}

export function sortKey(word: string): string {
  return [...word].sort().join('');
}

export function buildIndex(words: Iterable<string>): Dictionary {
  const set = new Set<string>();
  const byKey = new Map<string, string[]>();
  for (const w of words) {
    if (set.has(w)) continue;
    set.add(w);
    const k = sortKey(w);
    const arr = byKey.get(k);
    if (arr) arr.push(w);
    else byKey.set(k, [w]);
  }
  return { words: set, byKey };
}

/** Every word (length 3..6) that can be formed from the given letters. Sorted by length desc, then alpha. */
export function solutionsFor(dict: Dictionary, letters: string): string[] {
  const chars = [...letters.toLowerCase()];
  const n = chars.length;
  const keys = new Set<string>();
  // Enumerate all subsets of size 3..n (n=6 → 42 subsets), look up each sorted key.
  for (let mask = 1; mask < 1 << n; mask++) {
    let bits = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) bits++;
    if (bits < 3) continue;
    const sub: string[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sub.push(chars[i]);
    keys.add(sub.sort().join(''));
  }
  const out: string[] = [];
  for (const k of keys) {
    const ws = dict.byKey.get(k);
    if (ws) out.push(...ws);
  }
  return out.sort((a, b) => b.length - a.length || a.localeCompare(b));
}

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');

export function loadWords(file = path.join(dataDir, 'words.txt')): string[] {
  return readFileSync(file, 'utf8').split('\n').filter(Boolean);
}

export function loadSeeds(file = path.join(dataDir, 'seeds.txt')): string[] {
  return readFileSync(file, 'utf8').split('\n').filter(Boolean);
}

let cached: Dictionary | undefined;
/** Loads and indexes words.txt once per process. */
export function getDictionary(): Dictionary {
  return (cached ??= buildIndex(loadWords()));
}
