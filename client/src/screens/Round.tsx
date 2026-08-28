import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoomSnapshot } from '../../../shared/protocol.js';
import { ROUND_MS, type RejectReason } from '../../../shared/scoring.js';
import type { Game } from '../useGame';

const REASONS: Record<RejectReason, string> = {
  time: "Time's up",
  too_short: 'Too short',
  letters: 'Not in the letters',
  not_a_word: 'Not a word',
  duplicate: 'Already found',
};

export default function Round({ game, snapshot }: { game: Game; snapshot: RoomSnapshot }) {
  const round = snapshot.round!;
  const me = snapshot.players[snapshot.you];
  const opp = snapshot.players[1 - snapshot.you];
  const [typed, setTyped] = useState('');
  const [order, setOrder] = useState<number[]>(() => round.letters.split('').map((_, i) => i));
  const [shake, setShake] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const live = snapshot.phase === 'live';
  const typedRef = useRef(typed);
  typedRef.current = typed;

  // New letters (rematch) → reset local state.
  useEffect(() => {
    setOrder(round.letters.split('').map((_, i) => i));
    setTyped('');
  }, [round.letters]);

  // Server verdicts.
  const { flash } = game;
  useEffect(() => {
    if (!flash) return;
    if (flash.kind === 'accepted') {
      setNote(null);
    } else {
      setShake((n) => n + 1);
      setNote(REASONS[flash.reason!]);
    }
    setTyped('');
  }, [flash]);

  // Keyboard: global, never needs focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = typedRef.current;
      if (e.key === 'Enter') {
        if (t.length && live) game.submit(t);
        else if (t.length) setTyped('');
        e.preventDefault();
      } else if (e.key === 'Backspace') {
        setTyped(t.slice(0, -1));
        setNote(null);
        e.preventDefault();
      } else if (e.key === 'Escape') {
        setTyped('');
        setNote(null);
      } else if (e.key === ' ') {
        setOrder((o) => shuffle(o));
        e.preventDefault();
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        const c = e.key.toLowerCase();
        if (t.length < 6 && countAvailable(round.letters, t, c) > 0) {
          setTyped(t + c);
          setNote(null);
        }
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, live, round.letters]);

  // Which tile indices are consumed by the current word (first unused match per typed letter).
  const consumed = useMemo(() => {
    const used = new Set<number>();
    for (const c of typed) {
      const i = round.letters.split('').findIndex((l, idx) => l === c && !used.has(idx));
      if (i !== -1) used.add(i);
    }
    return used;
  }, [typed, round.letters]);

  const tileClick = (idx: number) => {
    if (consumed.has(idx) || typed.length >= 6) return;
    setTyped(typed + round.letters[idx]);
  };

  const words = [...(me.words ?? [])].reverse();

  return (
    <main className="round">
      <Clock startsAt={round.startsAt} endsAt={round.endsAt} offset={game.offset} live={live} />

      <div className="scores">
        <div className="score me">
          <span className="label">{me.name}</span>
          <span className="mono num">{me.score.toLocaleString()}</span>
        </div>
        {opp && (
          <div className="score opp">
            <span className="label">{opp.name}{opp.connected ? '' : ' · offline'}</span>
            <span className="mono num">{opp.score.toLocaleString()}</span>
            <span className="sub">{opp.wordCount} {opp.wordCount === 1 ? 'word' : 'words'}</span>
          </div>
        )}
      </div>

      <section className="board" aria-label="Letters">
        <div className="tiles">
          {order.map((idx) => (
            <button
              key={idx}
              type="button"
              className={'tile mono' + (consumed.has(idx) ? ' used' : '')}
              onClick={() => tileClick(idx)}
              aria-pressed={consumed.has(idx)}
              tabIndex={-1}
            >
              {round.letters[idx].toUpperCase()}
            </button>
          ))}
        </div>

        <div key={shake} className={'typed mono' + (shake ? ' shake' : '')} onAnimationEnd={() => setShake(0)} aria-live="polite">
          {live ? (
            <>
              <span className="text">{typed.toUpperCase()}</span>
              <span className="caret" aria-hidden="true" />
            </>
          ) : (
            <Countdown startsAt={round.startsAt} offset={game.offset} />
          )}
        </div>
        <p className={'note' + (note ? ' show' : '')} role="status">{note ?? ' '}</p>
      </section>

      <ol className="found" aria-label="Your words">
        {words.map((w, i) => (
          <li key={w.word} className={i === 0 && flash?.kind === 'accepted' && flash.word === w.word ? 'new' : ''}>
            <span className="mono word">{w.word.toUpperCase()}</span>
            <span className="mono pts">+{w.points.toLocaleString()}</span>
          </li>
        ))}
      </ol>
    </main>
  );
}

function Countdown({ startsAt, offset }: { startsAt: number; offset: number }) {
  const [n, setN] = useState(() => Math.ceil((startsAt - (Date.now() + offset)) / 1000));
  useEffect(() => {
    const id = setInterval(() => setN(Math.max(0, Math.ceil((startsAt - (Date.now() + offset)) / 1000))), 50);
    return () => clearInterval(id);
  }, [startsAt, offset]);
  return <span className="text count">{n > 0 ? n : 'Go'}</span>;
}

/** Hairline that retracts from full width to nothing over the round. rAF-driven off the server offset. */
function Clock({ startsAt, endsAt, offset, live }: { startsAt: number; endsAt: number; offset: number; live: boolean }) {
  const bar = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const now = Date.now() + offset;
      const remaining = Math.max(0, Math.min(ROUND_MS, endsAt - now));
      const frac = live ? remaining / ROUND_MS : 1;
      if (bar.current) bar.current.style.transform = `scaleX(${frac})`;
      if (label.current) label.current.textContent = live ? (remaining / 1000).toFixed(remaining < 10_000 ? 1 : 0) : '60';
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [startsAt, endsAt, offset, live]);
  return (
    <div className="clock" role="timer" aria-label="Time remaining">
      <div className="rule" ref={bar} />
      <span className="mono remaining" ref={label}>60</span>
    </div>
  );
}

function countAvailable(pool: string, typed: string, c: string): number {
  let n = 0;
  for (const l of pool) if (l === c) n++;
  for (const l of typed) if (l === c) n--;
  return n;
}

function shuffle<T>(a: T[]): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
