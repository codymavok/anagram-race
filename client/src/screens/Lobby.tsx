import { useState } from 'react';
import type { RoomSnapshot } from '../../../shared/protocol.js';
import type { Game } from '../useGame';

export default function Lobby({ game, snapshot }: { game: Game; snapshot: RoomSnapshot }) {
  const [copied, setCopied] = useState(false);
  const [readied, setReadied] = useState(false);
  const me = snapshot.players[snapshot.you];
  const opp = snapshot.players[1 - snapshot.you];
  const link = `${location.origin}${location.pathname}?room=${snapshot.code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the link is visible to copy by hand */
    }
  };

  const ready = () => {
    setReadied(true);
    game.ready();
  };

  return (
    <main className="lobby">
      <p className="eyebrow">Room code</p>
      <h1 className="display code">{snapshot.code}</h1>
      <div className="share">
        <input className="mono" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Share link" />
        <button type="button" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
      </div>

      <ul className="players" aria-live="polite">
        <li>
          <span className="who">{me.name} <em>(you)</em></span>
          <span className={'pill ' + (readied ? 'ok' : '')}>{readied ? 'Ready' : 'Not ready'}</span>
        </li>
        <li className={opp ? '' : 'empty'}>
          <span className="who">{opp ? opp.name : 'Waiting for opponent…'}</span>
          {opp && <span className="pill">{opp.connected ? 'Here' : 'Offline'}</span>}
        </li>
      </ul>

      <div className="actions">
        <button className="primary" type="button" onClick={ready} disabled={readied || !opp}>
          {readied ? (opp ? 'Waiting for opponent…' : 'Ready') : 'Ready'}
        </button>
        <button type="button" className="ghost" onClick={game.leave}>Leave</button>
      </div>
      {!opp && <p className="hint">Send the code or link to a friend. The round starts when you're both ready.</p>}
    </main>
  );
}
