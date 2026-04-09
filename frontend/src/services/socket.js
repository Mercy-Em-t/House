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
import { getToken } from './auth';
import config from '../config';

let socket = null;

export function connect() {
  if (socket && socket.connected) return socket;

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
  return socket;
}

export function disconnect() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/** Emit avatar movement. Payload: { x, y, z?, direction? } */
export function emitMove(x, y, z = 0, direction = 'down') {
  if (socket) socket.emit('avatar:move', { x, y, z, direction });
}

/** Tell the server the avatar has stopped moving. */
export function emitIdle() {
  if (socket) socket.emit('avatar:idle');
}

/** Send a chat message. */
export function emitChat(content, type = 'room', recipientId = null) {
  if (socket) socket.emit('chat:send', { content, type, recipientId });
}

/** Request room chat history. */
export function requestHistory(roomId) {
  if (socket) socket.emit('room:history', { roomId });
}
