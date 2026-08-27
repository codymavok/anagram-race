# PLAN.md — Two-Player Anagram Race (web)

> **How to use this file:** drop it at the root of an empty folder, open Claude Code there, and run
> `Read PLAN.md and enter plan mode. Build it milestone by milestone, stopping for my approval at each checkpoint.`
> Every "Checkpoint" below is a hard stop: show me what works, wait for a go-ahead, then continue.

---

## 1. What we're building

A browser-based, two-player, real-time anagram race modeled on the Anagrams game in the iMessage app GamePigeon.

Both players join a room, see **the same 6 letters**, and get **60 seconds** to type as many valid English words as possible from those letters. Highest score wins. Deployed to a public URL, source on GitHub.

**Scoring is fixed and non-negotiable — it matches the real game:**

| Word length | Points |
|---|---|
| 3 letters | 100 |
| 4 letters | 400 |
| 5 letters | 1,200 |
| 6 letters | 2,000 |

- Minimum word length is 3. Words of 1–2 letters are rejected outright.
- No penalty for a wrong guess — it's rejected with feedback and the clock keeps running.
- A word already scored this round cannot be scored again.

### Naming note (read this before creating the repo)

"GamePigeon" is a third-party product and trademark. Do **not** use that name, its pigeon mark, or its exact visual identity anywhere in the repo, the UI, the README, or the package name. Describe it as "inspired by fast-paced anagram games" if a comparison is needed. Working name: **`anagram-race`**. Swap it if I say otherwise, but don't ship someone else's brand.

---

## 2. Things only I can do — surface these early

Claude Code should get everything else to a done state, then hand me a short checklist. Do **not** silently stall on these:

1. **GitHub auth.** Run `gh auth status`. If not authenticated, stop and tell me to run `gh auth login`. The repo goes to `github.com/codymavok`.
2. **Host account.** Deployment needs an account on the host (see §8). Claude Code should commit the config and give me the exact click-path or CLI command.
3. **Custom domain**, if I want one later. Out of scope for v1.

---

## 3. Decisions already made (don't relitigate, do flag if one is actually wrong)

These are assumptions I'm locking in so you don't have to guess. If one of them makes the build materially worse, say so *once*, in plan mode, before writing code.

| Decision | Choice | Why |
|---|---|---|
| Multiplayer model | **Real-time.** Both players in the room simultaneously, same letters, same 60s window, live countdown. | "Two players on Chrome" reads as two browser windows racing, not turn-by-turn. The real game is asynchronous; this is the web adaptation. |
| Matchmaking | **6-character room code.** One player creates, shares the code or a `?room=ABC123` link, other joins. No accounts, no lobby browser. | Zero-friction for two friends. No auth to build. |
| Persistence | **In-memory only.** Rooms are ephemeral objects on the server, garbage-collected 10 min after the round ends. No database. | A 2-player 60-second round has nothing worth persisting in v1. Accept that a server restart kills live rooms; show a clean "room expired" state rather than a crash. |
| Authority | **Server-authoritative.** Server owns the letter set, the dictionary, the clock, and the score. | The client is untrusted. See §6. |
| Opponent visibility | During the round, show the opponent's **score and word count only — never their words.** | Keeps the tension without letting one player mine the other's answers. Make this a single config constant so it's easy to flip. |
| Platform | **Desktop Chrome, keyboard-first.** Latest 2 stable versions. | Stated requirement. Don't build a mobile layout; do make it not embarrassing below 900px. |

---

## 4. Stack

- **Frontend:** React 18 + TypeScript + Vite. Plain CSS with custom properties — no Tailwind, no component library.
- **Backend:** Node 20 + Express + `ws` (raw WebSocket, not Socket.IO — we don't need the fallbacks).
- **Shared:** a `shared/` module with the message types and scoring table, imported by both sides so the protocol can't drift.
- **Tests:** Vitest for the pure logic (scoring, validation, puzzle generation). No E2E framework in v1.
- **One deployable process.** Express serves the built frontend *and* upgrades the WebSocket on the same origin. No CORS config, no split environments, one URL.

```
anagram-race/
├── PLAN.md
├── README.md
├── package.json                 # npm workspaces
├── render.yaml                  # or fly.toml — see §8
├── shared/
│   ├── protocol.ts              # every message type, both directions
│   └── scoring.ts               # the points table + scoreWord()
├── server/
│   ├── src/
│   │   ├── index.ts             # express + ws bootstrap, serves client/dist
│   │   ├── rooms.ts             # room lifecycle state machine
│   │   ├── round.ts             # timer, submission handling, results
│   │   ├── dictionary.ts        # loads + indexes the word list
│   │   └── puzzles.ts           # letter-set generation
│   ├── data/
│   │   ├── words.txt            # committed, generated at build time
│   │   └── seeds.txt            # curated 6-letter seed words
│   └── scripts/build-wordlist.ts
└── client/
    └── src/
        ├── App.tsx
        ├── net.ts               # WebSocket client + reconnect
        ├── screens/{Home,Lobby,Round,Results}.tsx
        └── styles/tokens.css
```

---

## 5. The dictionary

**Source:** the **ENABLE** word list (Enhanced North American Benchmark Lexicon, ~172k words, public domain). Fall back to `dwyl/english-words` (Unlicense) if ENABLE is hard to fetch. Both are license-clean for this; note the source and license in the README.

**Build step** (`scripts/build-wordlist.ts`, run once, output committed):

1. Download the raw list.
2. Lowercase, strip anything non-`a-z`.
3. Keep only words of length **3–6** — nothing longer can ever be formed from 6 letters.
4. Deduplicate, sort, write to `server/data/words.txt`.

That should land around 30–40k words and a few hundred KB. Commit it so the deploy doesn't depend on a third-party download staying up.

**At runtime**, load into two structures:

- `Set<string>` for O(1) membership.
- A map from **sorted-letter key → words** (e.g. `"aegilnst"`), so we can pre-compute every solution for a letter set in one pass. Build once at boot, roughly a second.

**Do not ship the dictionary to the client.** Validation happens server-side only; a client-side copy is a solution list handed to a cheater who opens DevTools.

---

## 6. Game logic

### Letter-set generation

Random letters produce unplayable garbage. Generate the way the real game does — from a real word:

1. Pick a random word from `seeds.txt`, a curated list of **common** 6-letter words (build it by intersecting the dictionary with a frequency list, ~2–3k entries — avoid obscure ones so the 2,000-point word is actually findable).
2. Shuffle its letters. That guarantees at least one 6-letter solution exists.
3. Compute the full solution set from the sorted-letter index.
4. **Reject and re-roll** if: fewer than 2 vowels, or fewer than 25 total valid words, or fewer than 3 words of length ≥5. Cap at 50 attempts, then accept whatever's best.
5. Cache the solution set on the room — it's needed for the "words you missed" panel at the end.

### Word submission (server-side, in this order)

```
1. Round is live and now <= roundEndsAt + 300ms grace     → else reject "time"
2. Length is 3..6                                         → else reject "too_short"
3. Letters are available in the pool (multiset check —
   two S's require two S's in the pool)                    → else reject "letters"
4. In the dictionary                                       → else reject "not_a_word"
5. Not already found by this player this round             → else reject "duplicate"
→ accept, award points from the table, broadcast the new totals
```

Both players can score the same word independently — they're racing the same pool, not claiming from it.

### The clock

Server-authoritative. On round start, broadcast `{ letters, startsAt, endsAt, serverNow }`. The client computes its offset from `serverNow` and renders the countdown locally at 60fps against that offset — never trusting its own wall clock, never polling the server for the time. Server closes submissions at `endsAt + 300ms` (grace for network latency, not for cheating) and broadcasts results.

### Round lifecycle

```
WAITING → both players present → READY (3-2-1 countdown, 3s)
  → LIVE (60s) → SCORING → RESULTS → [rematch] → READY
```

Handle these explicitly, don't let them crash a round:
- A player disconnects mid-round → keep their score frozen, let the other finish, show "opponent left" in the results.
- A player reconnects within 15s → restore them into the live round with their score intact.
- Someone joins a full room → clear "this room already has two players."
- Room code doesn't exist → clear "no room with that code," not a blank screen.

---

## 7. Interface

**Screens:** Home (create / join) → Lobby (code + share link + ready) → Round → Results.

**Keyboard is the primary input.** Mouse is a fallback.
- `a-z` — type into the current word
- `Enter` — submit
- `Backspace` — delete, `Esc` — clear the word
- `Space` — reshuffle the tile display (cosmetic only, never changes the pool)
- The input should never need to be manually focused. Typing anywhere types into the game.

**Round screen contents:** the 6 tiles, the word being typed, the countdown, your score, your found-words list (newest first, with points), and the opponent's score + word count. Nothing else.

**Feedback must be instant and unmistakable** — an accepted word animates into the list with its points; a rejected word shakes and clears. Round-trip to the server is ~30ms on the same origin, so don't build optimistic local validation; just make the rejection legible.

**Results screen:** both scores, the winner, each player's words side by side, and a "words you missed" panel — the highest-scoring solutions nobody found. That panel is what makes people hit rematch.

### Visual direction

A starting point, not a mandate — push back if you have something better, but don't default to a generic dashboard.

- **Palette:** ground `#DCE2E5` (cool paper), tiles `#FBFCFC`, ink `#14181C`, accept `#0F6B63` (deep teal), reject `#9E4A4A` (muted rose), clock `#C9821B` (amber).
- **Type:** *Bricolage Grotesque* for display, *Public Sans* for body, *Martian Mono* for the letter tiles, score numerals, and countdown. Self-host or use Google Fonts with `display=swap`.
- **Signature element:** the six tiles are the fixed anchor of the screen, and **letters dim as you consume them while typing** — so the remaining pool is always readable at a glance mid-word. Functional, not decorative.
- **The clock** is a hairline rule spanning the full width of the board that retracts to nothing. It's the only ambient motion on the page. Everything else stays still.
- **Quality floor, unannounced:** visible keyboard focus rings, `prefers-reduced-motion` respected (kill the shake and the tile animations, keep the clock), no layout shift when the word list grows.

---

## 8. Deployment

**Recommended host: Render.** A persistent Node process with a long-lived WebSocket, which is exactly what Vercel/Netlify serverless functions are bad at. Railway and Fly.io are equally fine — pick one and commit its config.

Build: `npm run build` (builds client → `client/dist`, compiles server). Start: `node server/dist/index.js`. Server binds `process.env.PORT`.

Commit a `render.yaml` blueprint so the setup is one click for me. Then hand me the exact steps: connect the repo in the Render dashboard, confirm the blueprint, wait for the first deploy.

**Verify the deploy for real** — a green build is not a working game. Confirm the WebSocket upgrade succeeds over `wss://` on the deployed origin, not just `ws://localhost`. Free tiers often cold-start after idling; if the host does that, note it in the README so I'm not confused when the first load takes 30 seconds.

---

## 9. Milestones

Stop at every checkpoint.

**M0 — Repo and skeleton.** Workspaces, TS config, lint, `.gitignore`, MIT license, a stub README. `gh repo create codymavok/anagram-race --public --source=. --remote=origin --push`.
→ **Checkpoint:** repo is live at the URL, `npm install && npm run dev` starts both sides.

**M1 — Dictionary and puzzles.** Build script, word list committed, sorted-letter index, seed list, generator with the quality constraints. Pure functions, no server yet.
→ **Checkpoint:** a script prints 10 generated letter sets with their solution counts. I want to eyeball that they're playable.

**M2 — Scoring and validation.** `scoreWord()`, the full submission pipeline, Vitest suite covering the table, the multiset check (test a double letter explicitly), duplicates, length bounds, and the time grace window.
→ **Checkpoint:** tests pass, and the scoring test asserts the exact table from §1.

**M3 — Server and protocol.** Room state machine, WebSocket handlers, server clock, disconnect/reconnect. Exercise it with a CLI script or `wscat` before any UI exists.
→ **Checkpoint:** two terminal clients can play a full round end to end.

**M4 — Client.** All four screens, keyboard input, live countdown, the tile-dimming behavior, results with the missed-words panel.
→ **Checkpoint:** two Chrome windows, full round, correct scores. This is the first time it's actually a game.

**M5 — Edge cases and polish.** Every failure state from §6 handled visibly. Reduced motion, focus rings, the sub-900px layout. Run a round while killing one tab mid-timer.

**M6 — Deploy and document.** Host config, live URL, README with setup, how to play, the scoring table, the dictionary source and license, and the architecture in a paragraph.
→ **Checkpoint:** I play a live round against you on the deployed URL.

---

## 10. Done means

- [ ] Two people in separate Chrome windows on the public URL play a full 60-second round and both see the same, correct final scores.
- [ ] Scoring is exactly 100 / 400 / 1,200 / 2,000, with a test asserting it.
- [ ] Every letter set has at least one 6-letter solution and 25+ total words.
- [ ] Submitting a word not in the dictionary, or using letters not in the pool, or already found, is rejected — and the client can't score anything the server didn't approve.
- [ ] The timer is server-authoritative; editing client state in DevTools doesn't change a score.
- [ ] Reload mid-round, or a 5-second disconnect, doesn't lose your score.
- [ ] `github.com/codymavok/anagram-race` is public, the README is real, and `main` deploys clean.

---

## 11. Not in v1

Don't build these, don't leave scaffolding for them: accounts or login, a database, persistent stats or leaderboards, more than 2 players, chat, emotes, single-player or bot opponents, mobile/touch layout, sound, iMessage or native anything, internationalization or non-English dictionaries, spectators.

If a milestone starts growing toward one of these, stop and ask.
