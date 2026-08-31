import { useEffect, useState, type FormEvent } from 'react';
import { MAX_NAME_LENGTH } from '../../../shared/protocol.js';
import type { Game } from '../useGame';

export default function Home({ game, expired }: { game: Game; expired: boolean }) {
  const params = new URLSearchParams(location.search);
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('anagram-race.name') ?? '';
    } catch {
      return '';
    }
  });
  const [code, setCode] = useState(params.get('room')?.toUpperCase() ?? '');
  const [mode, setMode] = useState<'create' | 'join'>(params.get('room') ? 'join' : 'create');
  const { error, clearError, status } = game;

  useEffect(() => {
    try {
      localStorage.setItem('anagram-race.name', name);
    } catch {
      /* ignore */
    }
  }, [name]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    clearError();
    if (mode === 'create') game.create(name);
    else game.join(code, name);
  };

  const disabled = status !== 'open';

  return (
    <main className="home">
      <header className="home-head">
        <h1 className="display">Anagrams</h1>
        <p className="lede">Six letters. Sixty seconds. Two players. Find more words than your opponent.</p>
      </header>

      <form className="card" onSubmit={submit}>
        <div className="seg" role="tablist" aria-label="Create or join">
          <button type="button" role="tab" aria-selected={mode === 'create'} className={mode === 'create' ? 'on' : ''} onClick={() => setMode('create')}>
            Create a room
          </button>
          <button type="button" role="tab" aria-selected={mode === 'join'} className={mode === 'join' ? 'on' : ''} onClick={() => setMode('join')}>
            Join a room
          </button>
        </div>

        <label className="field">
          <span>Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_NAME_LENGTH} placeholder="Player" autoComplete="nickname" />
        </label>

        {mode === 'join' && (
          <label className="field">
            <span>Room code</span>
            <input
              className="mono code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              placeholder="ABC123"
              autoFocus
              spellCheck={false}
              autoCapitalize="characters"
            />
          </label>
        )}

        {expired && !error && <p className="notice">That room has expired. Start a new one.</p>}
        {error && (
          <p className="notice err" role="alert">
            {error.message}
          </p>
        )}

        <button className="primary" type="submit" disabled={disabled || (mode === 'join' && code.length !== 6)}>
          {mode === 'create' ? 'Create room' : 'Join room'}
        </button>
      </form>

      <section className="rules">
        <h2>Scoring</h2>
        <table>
          <tbody>
            <tr><td>3 letters</td><td className="mono">100</td></tr>
            <tr><td>4 letters</td><td className="mono">400</td></tr>
            <tr><td>5 letters</td><td className="mono">1,200</td></tr>
            <tr><td>6 letters</td><td className="mono">2,000</td></tr>
          </tbody>
        </table>
        <p>Click letters to spell a word, then hit Submit (or <kbd>Enter</kbd>). Click a letter again or press <kbd>Delete</kbd> to remove it.</p>
      </section>
    </main>
  );
}
