/**
 * Socket Service
 *
 * Singleton wrapper around socket.io-client.
 * The JWT is passed via the auth handshake so the server can authenticate
 * the connection before any events are processed.
 *
 * Designed to be 3D-upgrade-friendly:
 *  – position payloads always include z (defaults to 0 in 2D mode)
 *  – avatar state includes direction (can map to rotation in 3D)
 */
import { io } from 'socket.io-client';
import { getStoredUser, getToken } from './auth';
import config from '../config';

let socket = null;
let wsClient = null;

function createWSAdapter(url) {
  const listeners = new Map();
  const user = getStoredUser();
  const qs = new URLSearchParams();
  if (user?.id) qs.set('userId', user.id);
  if (user?.username) qs.set('username', user.username);
  if (user?.avatarColor) qs.set('avatarColor', user.avatarColor);
  const token = getToken();
  if (token) qs.set('token', token);
  const separator = url.includes('?') ? '&' : '?';
  const wsUrl = `${url}${qs.toString() ? `${separator}${qs.toString()}` : ''}`;
  const ws = new WebSocket(wsUrl);

  function emitLocal(event, payload) {
    const handlers = listeners.get(event);
    if (!handlers) return;
    handlers.forEach((fn) => fn(payload));
  }

  ws.addEventListener('open', () => emitLocal('connect'));
  ws.addEventListener('close', () => emitLocal('disconnect'));
  ws.addEventListener('error', () => emitLocal('disconnect'));
  ws.addEventListener('message', (event) => {
    try {
      const parsed = JSON.parse(event.data);
      if (parsed?.event) emitLocal(parsed.event, parsed.data);
    } catch (err) {
      console.error('[Socket] ws parse error:', err.message);
    }
  });

  return {
    get connected() {
      return ws.readyState === WebSocket.OPEN;
    },
    on(event, cb) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(cb);
    },
    off(event) {
      if (!event) return;
      listeners.delete(event);
    },
    emit(event, data) {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ event, data }));
    },
    disconnect() {
      ws.close();
    },
  };
}

export function connect() {
  if (socket && socket.connected) return socket;
  if (wsClient && wsClient.connected) return wsClient;

  const useRustTransport = config.runtime.mode === 'rust' || config.runtime.mode === 'auto';
  if (useRustTransport && config.socketUrl && config.socketUrl.startsWith('ws')) {
    wsClient = createWSAdapter(config.socketUrl);
    return wsClient;
  }

  socket = io(config.socketUrl || '/', {
    auth: { token: getToken() },
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] connection error:', err.message);
  });

  return socket;
}

export function getSocket() {
  return socket || wsClient;
}

export function disconnect() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  if (wsClient) {
    wsClient.disconnect();
    wsClient = null;
  }
}

/** Emit movement intent. */
export function emitIntent(intent) {
  if (socket) socket.emit('avatar:intent', intent);
  if (wsClient) wsClient.emit('avatar:intent', intent);
}

/** Tell the server the avatar has stopped moving. */
export function emitIdle() {
  if (socket) socket.emit('avatar:idle');
  if (wsClient) wsClient.emit('avatar:idle');
}

/** Send a chat message. */
export function emitChat(content, type = 'room', recipientId = null) {
  if (socket) socket.emit('chat:send', { content, type, recipientId });
  if (wsClient) wsClient.emit('chat:send', { content, type, recipientId });
}

/** Request room chat history. */
export function requestHistory(roomId) {
  if (socket) socket.emit('room:history', { roomId });
  if (wsClient) wsClient.emit('room:history', { roomId });
}

/** Explicitly join a room channel. */
export function emitJoinRoom(roomId) {
  if (socket) socket.emit('room:join', { roomId });
  if (wsClient) wsClient.emit('room:join', { roomId });
}
