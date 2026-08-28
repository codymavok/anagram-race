import { getDictionary, loadSeeds } from '../src/dictionary.js';
import { generatePuzzle } from '../src/puzzles.js';

const t0 = performance.now();
const dict = getDictionary();
const seeds = loadSeeds();
console.log(`dictionary: ${dict.words.size} words, ${seeds.length} seeds, indexed in ${(performance.now() - t0).toFixed(0)}ms\n`);

const n = Number(process.argv[2] ?? 10);
for (let i = 0; i < n; i++) {
  const p = generatePuzzle(dict, seeds);
  const byLen = [3, 4, 5, 6].map((l) => `${l}:${p.solutions.filter((w) => w.length === l).length}`).join('  ');
  const top = p.solutions.slice(0, 6).join(', ');
  console.log(`${p.letters.toUpperCase().split('').join(' ')}   ${String(p.solutions.length).padStart(3)} words  (${byLen})  e.g. ${top}`);
}
