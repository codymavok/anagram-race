import { useEffect, useMemo, useRef, useState } from 'react';
import type { RejectReason } from '../../shared/scoring.js';
import type { RoomSnapshot, ServerErrorCode } from '../../shared/protocol.js';
import { Net, type NetStatus } from './net';

export interface Flash {
  id: number;
  kind: 'accepted' | 'rejected';
  word: string;
  points?: number;
  reason?: RejectReason;
}

export interface Game {
  net: Net;
  status: NetStatus;
  snapshot: RoomSnapshot | null;
  error: { code: ServerErrorCode; message: string } | null;
  clearError(): void;
  flash: Flash | null;
  /** serverNow - clientNow, so the countdown never trusts the local wall clock alone. */
  offset: number;
  create(name: string): void;
  join(code: string, name: string): void;
  ready(): void;
  submit(word: string): void;
  rematch(): void;
  leave(): void;
}

export function useGame(): Game {
  const net = useMemo(() => new Net(), []);
  const [status, setStatus] = useState<NetStatus>(net.status);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<Game['error']>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const offsetRef = useRef(0);
  const flashId = useRef(0);

  useEffect(() => {
    const offMsg = net.onMessage((m) => {
      switch (m.type) {
        case 'state':
          offsetRef.current = m.snapshot.serverNow - Date.now();
          setSnapshot(m.snapshot);
          if (m.snapshot.phase === 'expired') net.setSession(null);
          break;
        case 'accepted':
          setFlash({ id: ++flashId.current, kind: 'accepted', word: m.word, points: m.points });
          break;
        case 'rejected':
          setFlash({ id: ++flashId.current, kind: 'rejected', word: m.word, reason: m.reason });
          break;
        case 'error':
          setError({ code: m.code, message: m.message });
          break;
      }
    });
    const offStatus = net.onStatus(setStatus);
    net.connect();
    return () => {
      offMsg();
      offStatus();
    };
  }, [net]);

  return {
    net,
    status,
    snapshot,
    error,
    clearError: () => setError(null),
    flash,
    offset: offsetRef.current,
    create: (name) => net.send({ type: 'create', name }),
    join: (code, name) => net.send({ type: 'join', code: code.trim().toUpperCase(), name }),
    ready: () => net.send({ type: 'ready' }),
    submit: (word) => net.send({ type: 'submit', word }),
    rematch: () => net.send({ type: 'rematch' }),
    leave: () => {
      net.send({ type: 'leave' });
      net.setSession(null);
      setSnapshot(null);
      history.replaceState(null, '', location.pathname);
    },
  };
}
