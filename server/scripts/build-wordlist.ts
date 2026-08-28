/**
 * Builds server/data/words.txt and server/data/seeds.txt. Run once; outputs are committed.
 *
 * words.txt : ENABLE word list (public domain), lowercased, a-z only, lengths 3..6, deduped, sorted.
 * seeds.txt : common 6-letter words used to generate letter sets. Built by intersecting ENABLE with
 *             two frequency-ranked lists (google-10000-english, then hermitdave/FrequencyWords en_50k,
 *             which is derived from OpenSubtitles), keeping the most common words first. Only words that
 *             pass the puzzle quality rules are kept, so the 6-letter solution is always a findable word.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, solutionsFor } from '../src/dictionary.js';

const ENABLE_URL = 'https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt';
const FALLBACK_URL = 'https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt';
const FREQ_URL =
  'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt';
const FREQ2_URL = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt';
const SEED_TARGET = 2500;

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

function clean(raw: string): string[] {
  const out = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const w = line.trim().toLowerCase();
    if (/^[a-z]{3,6}$/.test(w)) out.add(w);
  }
  return [...out].sort();
}

let source = 'ENABLE';
let raw: string;
try {
  raw = await fetchText(ENABLE_URL);
} catch (err) {
  console.warn(`ENABLE fetch failed (${(err as Error).message}); falling back to dwyl/english-words`);
  source = 'dwyl/english-words';
  raw = await fetchText(FALLBACK_URL);
}
const words = clean(raw);
mkdirSync(dataDir, { recursive: true });
writeFileSync(path.join(dataDir, 'words.txt'), words.join('\n') + '\n');
console.log(`words.txt: ${words.length} words (source: ${source})`);

// ---- seeds ----
const dict = buildIndex(words);
const six = words.filter((w) => w.length === 6);
const isRich = (w: string) => {
  const s = solutionsFor(dict, w);
  return s.length >= 25 && s.filter((x) => x.length >= 5).length >= 3;
};

const freqWords = clean(await fetchText(FREQ_URL)).filter((w) => w.length === 6 && dict.words.has(w));
const seeds = new Set(freqWords.filter(isRich));
console.log(`seeds from frequency list: ${seeds.size} (of ${freqWords.length} common 6-letter words)`);

// Top up, in frequency order, from a larger corpus-derived list (format: "word count" per line).
const freq2 = (await fetchText(FREQ2_URL))
  .split(/\r?\n/)
  .map((l) => l.split(' ')[0]?.toLowerCase() ?? '')
  .filter((w) => /^[a-z]{6}$/.test(w) && dict.words.has(w));
let added = 0;
for (const w of freq2) {
  if (seeds.size >= SEED_TARGET) break;
  if (!seeds.has(w) && isRich(w)) {
    seeds.add(w);
    added++;
  }
}
console.log(`seeds topped up from en_50k: +${added}`);
const seedList = [...seeds].sort();
writeFileSync(path.join(dataDir, 'seeds.txt'), seedList.join('\n') + '\n');
console.log(`seeds.txt: ${seedList.length} seed words`);
