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
  /** Tile indices picked so far, in order. Click a tile to add it; click it again to remove it. */
  const [picked, setPicked] = useState<number[]>([]);
  const [order, setOrder] = useState<number[]>(() => round.letters.split('').map((_, i) => i));
  const [shake, setShake] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const live = snapshot.phase === 'live';
  const word = picked.map((i) => round.letters[i]).join('');
  const wordRef = useRef(word);
  wordRef.current = word;

  // New letters (rematch) → reset local state.
  useEffect(() => {
    setOrder(round.letters.split('').map((_, i) => i));
    setPicked([]);
  }, [round.letters]);

  // Server verdicts.
  const { flash } = game;
  useEffect(() => {
    if (!flash) return;
    if (flash.kind === 'accepted') setNote(null);
    else {
      setShake((n) => n + 1);
      setNote(REASONS[flash.reason!]);
    }
    setPicked([]);
  }, [flash]);

  const submit = () => {
    if (wordRef.current.length && live) game.submit(wordRef.current);
  };
  const shuffleTiles = () => setOrder((o) => shuffle(o));

  // Keyboard shortcuts: Enter submits, Backspace/Delete removes the last letter, Esc clears.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') {
        submit();
        e.preventDefault();
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        setPicked((p) => p.slice(0, -1));
        setNote(null);
        e.preventDefault();
      } else if (e.key === 'Escape') {
        setPicked([]);
        setNote(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live]);

  const consumed = useMemo(() => new Set(picked), [picked]);

  const tileClick = (idx: number) => {
    setNote(null);
    setPicked((p) => (p.includes(idx) ? p.filter((i) => i !== idx) : p.length < 6 ? [...p, idx] : p));
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
              disabled={!live}
            >
              {round.letters[idx].toUpperCase()}
            </button>
          ))}
        </div>

        <div key={shake} className={'typed mono' + (shake ? ' shake' : '')} onAnimationEnd={() => setShake(0)} aria-live="polite">
          {live ? (
            <span className="text">{word.toUpperCase()}</span>
          ) : (
            <Countdown startsAt={round.startsAt} offset={game.offset} />
          )}
        </div>
        <p className={'note' + (note ? ' show' : '')} role="status">{note ?? ' '}</p>

        <div className="controls">
          <button type="button" onClick={shuffleTiles} disabled={!live}>Shuffle</button>
          <button type="button" className="primary" onClick={submit} disabled={!live || word.length === 0}>Submit</button>
        </div>
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

function shuffle<T>(a: T[]): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
