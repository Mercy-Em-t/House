/**
 * House Virtual Workspace – Socket.io Handler
 *
 * Manages real-time events:
 *
 *  Client → Server
 *  ───────────────
 *  avatar:move       – { x, y, z?, direction? }
 *  avatar:idle       – (no payload)
 *  chat:send         – { content, type?, recipientId? }
 *  room:history      – { roomId }
 *
 *  Server → Client
 *  ───────────────
 *  world:init        – full world + current avatars (on connect)
 *  avatar:joined     – new avatar appeared
 *  avatar:update     – position/state changed
 *  avatar:left       – avatar disconnected
 *  chat:message      – new message
 *  chat:history      – recent room history
 *  proximity:update  – list of nearby avatars changed
 */
'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const avatarManager = require('../avatar/avatarManager');
const chatManager = require('../communication/chatManager');
const worldEngine = require('../world/worldEngine');

// Track which socket belongs to which userId
const socketToUser = new Map(); // socketId → userId

/**
 * Extract and verify a JWT from the Socket.io handshake.
 * The token may appear in auth.token or query.token.
 *
 * @param {import('socket.io').Socket} socket
 * @returns {{ id: string, email: string, role: string, username: string, avatarColor: string } | null}
 */
function verifySocketToken(socket) {
  const token =
    (socket.handshake.auth && socket.handshake.auth.token) ||
    socket.handshake.query.token;

  if (!token) return null;

  try {
    return jwt.verify(token, config.jwt.secret);
  } catch {
    return null;
  }
}

/**
 * @param {import('socket.io').Server} io
 */
function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    // ── Authentication ────────────────────────────────────────────────────────
    const decoded = verifySocketToken(socket);
    if (!decoded) {
      socket.emit('error', { message: 'Authentication failed' });
      socket.disconnect(true);
      return;
    }

    const userId = decoded.id;
    socketToUser.set(socket.id, userId);

    // Spawn (or re-spawn) the avatar
    const avatar = avatarManager.spawn({
      userId,
      username: decoded.username || decoded.email,
      avatarColor: decoded.avatarColor || '#3498db',
    });

    // ── Join the socket room for the avatar's current room ────────────────────
    if (avatar.roomId) {
      socket.join(`room:${avatar.roomId}`);
    }

    // ── Send world state to the newly connected client ────────────────────────
    socket.emit('world:init', {
      world: worldEngine.toJSON(),
      avatars: avatarManager.getAll(),
      myUserId: userId,
    });

    // ── Notify everyone else that a new avatar joined ─────────────────────────
    socket.broadcast.emit('avatar:joined', avatar);

    // ── Movement ──────────────────────────────────────────────────────────────
    socket.on('avatar:move', (data) => {
      const { x, y, z = 0, direction } = data || {};
      if (typeof x !== 'number' || typeof y !== 'number') return;

      const updated = avatarManager.move(userId, { x, y, z, direction });
      if (!updated) return;

      // Update socket room membership when entering/leaving a room
      const previousRooms = Array.from(socket.rooms).filter((r) =>
        r.startsWith('room:')
      );
      const newRoom = updated.roomId ? `room:${updated.roomId}` : null;

      for (const pr of previousRooms) {
        if (pr !== newRoom) socket.leave(pr);
      }
      if (newRoom && !socket.rooms.has(newRoom)) {
        socket.join(newRoom);
      }

      // Broadcast updated position to all clients
      io.emit('avatar:update', updated);

      // Compute and emit proximity list back to this client
      const nearby = worldEngine.getNearbyAvatars(
        { x: updated.x, y: updated.y },
        userId,
        avatarManager.getAll()
      );
      socket.emit('proximity:update', { nearby: nearby.map((a) => a.id) });
    });

    // ── Idle ─────────────────────────────────────────────────────────────────
    socket.on('avatar:idle', () => {
      avatarManager.setIdle(userId);
      const avatar = avatarManager.get(userId);
      if (avatar) io.emit('avatar:update', avatar);
    });

    // ── Chat ─────────────────────────────────────────────────────────────────
    socket.on('chat:send', (data) => {
      const { content, type = 'room', recipientId } = data || {};
      if (!content || typeof content !== 'string') return;
      if (content.length > 1000) return; // basic length guard

      const senderAvatar = avatarManager.get(userId);
      if (!senderAvatar) return;

      const message = chatManager.buildMessage({
        type,
        senderId: userId,
        senderName: senderAvatar.username,
        content: content.trim(),
        roomId: senderAvatar.roomId,
        recipientId,
      });

      switch (type) {
        case 'global':
          chatManager.addGlobalMessage(message);
          io.emit('chat:message', message);
          break;

        case 'proximity': {
          const allAvatars = avatarManager.getAll();
          const nearby = worldEngine.getNearbyAvatars(
            { x: senderAvatar.x, y: senderAvatar.y },
            userId,
            allAvatars
          );
          chatManager.addRoomMessage(senderAvatar.roomId || 'global', message);
          // Send to nearby sockets
          socket.emit('chat:message', message); // sender sees their own message
          for (const nearbyAvatar of nearby) {
            const targetSocketId = findSocketByUserId(nearbyAvatar.id);
            if (targetSocketId) io.to(targetSocketId).emit('chat:message', message);
          }
          break;
        }

        case 'dm':
          if (!recipientId) break;
          chatManager.addRoomMessage(`dm:${[userId, recipientId].sort().join(':')}`, message);
          socket.emit('chat:message', message);
          {
            const targetSocketId = findSocketByUserId(recipientId);
            if (targetSocketId) io.to(targetSocketId).emit('chat:message', message);
          }
          break;

        case 'room':
        default:
          if (senderAvatar.roomId) {
            chatManager.addRoomMessage(senderAvatar.roomId, message);
            io.to(`room:${senderAvatar.roomId}`).emit('chat:message', message);
          } else {
            // Not in a room — send only to sender
            socket.emit('chat:message', message);
          }
          break;
      }
    });

    // ── Room history request ──────────────────────────────────────────────────
    socket.on('room:history', ({ roomId } = {}) => {
      if (!roomId) return;
      const history = chatManager.getRoomHistory(roomId);
      socket.emit('chat:history', { roomId, messages: history });
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      socketToUser.delete(socket.id);
      avatarManager.despawn(userId);
      io.emit('avatar:left', { userId });
    });
  });
}

/** Find the socket id for a given userId. */
function findSocketByUserId(userId) {
  for (const [socketId, uid] of socketToUser.entries()) {
    if (uid === userId) return socketId;
  }
  return null;
}

module.exports = { registerSocketHandlers };
