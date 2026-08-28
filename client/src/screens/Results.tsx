import { useState } from 'react';
import type { RoomSnapshot } from '../../../shared/protocol.js';
import type { Game } from '../useGame';

export default function Results({ game, snapshot }: { game: Game; snapshot: RoomSnapshot }) {
  const [asked, setAsked] = useState(false);
  const r = snapshot.results!;
  const me = snapshot.players[snapshot.you];
  const opp = snapshot.players[1 - snapshot.you];
  const youWon = r.winner === snapshot.you;
  const headline = r.winner === null ? "It's a tie" : youWon ? 'You win' : `${snapshot.players[r.winner].name} wins`;
  const leftName = r.left !== null ? snapshot.players[r.left]?.name : null;
  const oppGone = !opp || !opp.connected;

  const rematch = () => {
    setAsked(true);
    game.rematch();
  };

  return (
    <main className="results">
      <p className="eyebrow">{snapshot.round!.letters.toUpperCase().split('').join(' ')}</p>
      <h1 className="display">{headline}</h1>
      {leftName && <p className="notice">{leftName} left during the round.</p>}

      <div className="final">
        <Column player={me} you />
        {opp && <Column player={opp} />}
      </div>

      <section className="missed">
        <h2>Words you both missed</h2>
        {r.missed.length === 0 ? (
          <p className="hint">Nothing — you found every top word.</p>
        ) : (
          <ul>
            {r.missed.map((w) => (
              <li key={w.word}>
                <span className="mono word">{w.word.toUpperCase()}</span>
                <span className="mono pts">{w.points.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="hint">{r.totalSolutions} words were possible.</p>
      </section>

      <div className="actions">
        <button className="primary" type="button" onClick={rematch} disabled={asked || oppGone}>
          {oppGone ? 'Opponent left' : asked ? 'Waiting for opponent…' : 'Rematch'}
        </button>
        <button type="button" className="ghost" onClick={game.leave}>Leave</button>
      </div>
    </main>
  );
}

function Column({ player, you }: { player: RoomSnapshot['players'][number]; you?: boolean }) {
  const words = [...(player.words ?? [])].sort((a, b) => b.points - a.points || a.word.localeCompare(b.word));
  return (
    <div className="col">
      <h2>
        {player.name} {you && <em>(you)</em>}
      </h2>
      <p className="mono num big">{player.score.toLocaleString()}</p>
      <ul>
        {words.map((w) => (
          <li key={w.word}>
            <span className="mono word">{w.word.toUpperCase()}</span>
            <span className="mono pts">{w.points.toLocaleString()}</span>
          </li>
        ))}
        {words.length === 0 && <li className="hint">No words</li>}
      </ul>
    </div>
  );
}
