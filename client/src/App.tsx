import { useEffect, useState } from 'react';

export default function App() {
  const [status, setStatus] = useState('connecting…');
  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'ping' }));
    ws.onmessage = (e) => setStatus(`server says ${e.data}`);
    ws.onerror = () => setStatus('websocket error');
    return () => ws.close();
  }, []);
  return (
    <main style={{ padding: '2rem', fontFamily: 'var(--font-body)' }}>
      <h1 style={{ fontFamily: 'var(--font-display)' }}>Anagram Race</h1>
      <p>{status}</p>
    </main>
  );
}
