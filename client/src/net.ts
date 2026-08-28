import type { ClientMessage, ServerMessage } from '../../shared/protocol.js';

type Listener = (msg: ServerMessage) => void;

/**
 * Thin WebSocket client. Reconnects with backoff and, if it was in a room, sends `rejoin`
 * with the stored token so a reload or a brief drop restores the player.
 */
export class Net {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(s: NetStatus) => void>();
  private retry = 0;
  private closedByUser = false;
  status: NetStatus = 'connecting';
  session: { code: string; token: string } | null = loadSession();

  connect(): void {
    this.closedByUser = false;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    this.setStatus('connecting');
    ws.onopen = () => {
      this.retry = 0;
      this.setStatus('open');
      if (this.session) this.send({ type: 'rejoin', code: this.session.code, token: this.session.token });
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data) as ServerMessage;
      if (msg.type === 'joined') this.setSession({ code: msg.code, token: msg.token });
      if (msg.type === 'error' && (msg.code === 'bad_token' || msg.code === 'no_such_room' || msg.code === 'room_expired')) {
        // Stale session — drop it so the next connect doesn't loop on it.
        if (this.session) this.setSession(null);
      }
      for (const l of this.listeners) l(msg);
    };
    ws.onclose = () => {
      this.ws = null;
      if (this.closedByUser) return;
      this.setStatus('reconnecting');
      const delay = Math.min(500 * 2 ** this.retry++, 5000);
      setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  onMessage(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  onStatus(l: (s: NetStatus) => void): () => void {
    this.statusListeners.add(l);
    return () => this.statusListeners.delete(l);
  }

  setSession(s: { code: string; token: string } | null): void {
    this.session = s;
    try {
      if (s) sessionStorage.setItem('anagram-race.session', JSON.stringify(s));
      else sessionStorage.removeItem('anagram-race.session');
    } catch {
      /* storage unavailable — reconnect just won't restore */
    }
  }

  private setStatus(s: NetStatus) {
    this.status = s;
    for (const l of this.statusListeners) l(s);
  }
}

export type NetStatus = 'connecting' | 'open' | 'reconnecting';

function loadSession(): { code: string; token: string } | null {
  try {
    const raw = sessionStorage.getItem('anagram-race.session');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
