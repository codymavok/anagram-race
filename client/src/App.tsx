import { useEffect } from 'react';
import { useGame } from './useGame';
import Home from './screens/Home';
import Lobby from './screens/Lobby';
import Round from './screens/Round';
import Results from './screens/Results';

export default function App() {
  const game = useGame();
  const { snapshot, status } = game;

  // Keep ?room=CODE in the URL while in a room so the share link is always the address bar.
  useEffect(() => {
    if (snapshot && snapshot.phase !== 'expired') {
      const url = new URL(location.href);
      if (url.searchParams.get('room') !== snapshot.code) {
        url.searchParams.set('room', snapshot.code);
        history.replaceState(null, '', url);
      }
    }
  }, [snapshot]);

  let screen;
  if (!snapshot || snapshot.phase === 'expired') screen = <Home game={game} expired={snapshot?.phase === 'expired'} />;
  else if (snapshot.phase === 'waiting') screen = <Lobby game={game} snapshot={snapshot} />;
  else if (snapshot.phase === 'ready' || snapshot.phase === 'live') screen = <Round game={game} snapshot={snapshot} />;
  else screen = <Results game={game} snapshot={snapshot} />;

  return (
    <>
      {status !== 'open' && (
        <div className="banner" role="status">
          {status === 'connecting' ? 'Connecting…' : 'Connection lost — reconnecting…'}
        </div>
      )}
      {screen}
    </>
  );
}
