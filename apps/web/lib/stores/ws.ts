'use client';

import { create } from 'zustand';
import type { WSEnvelope, WSEventName } from '@contentpulse/types';

type EventListener = (data: WSEnvelope['data']) => void;

interface WsState {
  connected: boolean;
  socket: WebSocket | null;
  listeners: Map<WSEventName, Set<EventListener>>;
  connect: (token: string) => void;
  disconnect: () => void;
  on: (event: WSEventName, listener: EventListener) => () => void;
  emit: (envelope: WSEnvelope) => void;
}

const WS_URL = process.env['NEXT_PUBLIC_WS_URL'] ?? 'ws://localhost:3001/v1/ws';

export const useWsStore = create<WsState>((set, get) => ({
  connected: false,
  socket: null,
  listeners: new Map(),

  connect: (token) => {
    const existing = get().socket;
    if (existing && existing.readyState === WebSocket.OPEN) return;

    const socket = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);

    socket.onopen = () => set({ connected: true });
    socket.onclose = () => set({ connected: false, socket: null });
    socket.onerror = () => set({ connected: false });

    socket.onmessage = (event: MessageEvent<string>) => {
      try {
        const envelope = JSON.parse(event.data) as WSEnvelope;
        get().emit(envelope);
      } catch {
        // ignore malformed messages
      }
    };

    set({ socket });
  },

  disconnect: () => {
    const socket = get().socket;
    if (socket) socket.close();
    set({ socket: null, connected: false });
  },

  on: (event, listener) => {
    const { listeners } = get();
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(listener);
    set({ listeners: new Map(listeners) });

    return () => {
      listeners.get(event)?.delete(listener);
      set({ listeners: new Map(listeners) });
    };
  },

  emit: (envelope) => {
    const { listeners } = get();
    listeners.get(envelope.event)?.forEach((fn) => fn(envelope.data));
  },
}));
