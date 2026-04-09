/**
 * House Virtual Workspace – Socket.io Handler
 *
 * Client sends intent; server simulates movement on a fixed tick.
 */
'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const avatarManager = require('../avatar/avatarManager');
const chatManager = require('../communication/chatManager');
const worldEngine = require('../world/worldEngine');

const socketToUser = new Map(); // socketId -> userId
const userToSocket = new Map(); // userId -> socketId
const movementIntentByUser = new Map(); // userId -> intent
const nearbyCacheByUser = new Map(); // userId -> string[]

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
  const tickMs = Math.round(1000 / config.world.tickRate);
  let lastTickTime = Date.now();

  const interval = setInterval(() => {
    const now = Date.now();
    const dt = Math.max(0, (now - lastTickTime) / 1000);
    lastTickTime = now;

    const changed = [];
    for (const [userId, intent] of movementIntentByUser.entries()) {
      const avatar = avatarManager.simulate(userId, intent, dt);
      if (avatar) changed.push(avatar);
    }

    // Proximity + interaction state updates with hysteresis
    const allAvatars = avatarManager.getAll();
    for (const avatar of allAvatars) {
      const prevNearby = nearbyCacheByUser.get(avatar.id) || [];
      const nearby = worldEngine.getNearbyAvatarIdsWithHysteresis(
        { x: avatar.x, y: avatar.y },
        avatar.id,
        allAvatars,
        prevNearby
      );
      nearbyCacheByUser.set(avatar.id, nearby);

      if (!arrayEqual(prevNearby, nearby)) {
        const sid = userToSocket.get(avatar.id);
        if (sid) io.to(sid).emit('proximity:update', { nearby });
      }

      if (avatar.state === 'idle' && nearby.length > 0) {
        avatarManager.setState(avatar.id, 'interacting', 900);
        changed.push(avatarManager.get(avatar.id));
      }
    }

    if (changed.length > 0) {
      io.emit('world:snapshot', {
        serverTime: now,
        avatars: allAvatars,
      });
    }
  }, tickMs);

  io.on('connection', (socket) => {
    const decoded = verifySocketToken(socket);
    if (!decoded) {
      socket.emit('error', { message: 'Authentication failed' });
      socket.disconnect(true);
      return;
    }

    const userId = decoded.id;
    socketToUser.set(socket.id, userId);
    userToSocket.set(userId, socket.id);
    movementIntentByUser.set(userId, { mode: 'steer', active: false });
    nearbyCacheByUser.set(userId, []);

    const avatar = avatarManager.spawn({
      userId,
      username: decoded.username || decoded.email,
      avatarColor: decoded.avatarColor || '#3498db',
    });

    if (avatar.roomId) socket.join(`room:${avatar.roomId}`);

    socket.emit('world:init', {
      world: worldEngine.toJSON(),
      avatars: avatarManager.getAll(),
      myUserId: userId,
    });
    socket.broadcast.emit('avatar:joined', avatar);

    socket.on('avatar:intent', (data) => {
      const mode = ['steer', 'tap', 'grid'].includes(data?.mode) ? data.mode : 'steer';
      const active = Boolean(data?.active);
      const direction = normalizeDirection(data?.direction);
      const speed = Number(data?.speed) || config.world.movement.defaultSpeed;
      const sequence = Number(data?.sequence) || 0;
      const clientTime = Number(data?.clientTime) || Date.now();
      const intent = {
        mode,
        active,
        direction,
        speed,
        target: sanitizeTarget(data?.target),
        sequence,
        clientTime,
      };

      // grid mode is deterministic one-step movement intent
      if (mode === 'grid' && active && direction) {
        const current = avatarManager.get(userId);
        if (current) {
          intent.target = {
            x: current.x + direction.x * config.world.movement.gridStep,
            y: current.y + direction.y * config.world.movement.gridStep,
          };
        }
      }

      movementIntentByUser.set(userId, intent);
    });

    socket.on('avatar:idle', () => {
      movementIntentByUser.set(userId, { mode: 'steer', active: false });
      avatarManager.setIdle(userId);
      const updated = avatarManager.get(userId);
      if (updated) io.emit('avatar:update', updated);
    });

    socket.on('room:join', ({ roomId } = {}) => {
      if (!roomId || !worldEngine.getRoom(roomId)) return;
      const target = `room:${roomId}`;
      for (const r of socket.rooms) {
        if (r.startsWith('room:') && r !== target) socket.leave(r);
      }
      socket.join(target);
      socket.emit('room:joined', { roomId });
    });

    socket.on('chat:send', (data) => {
      const { content, type = 'room', recipientId } = data || {};
      if (!content || typeof content !== 'string') return;
      if (content.length > 1000) return;

      const senderAvatar = avatarManager.get(userId);
      if (!senderAvatar) return;
      avatarManager.setState(userId, 'speaking', 1200);

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
          const nearby = nearbyCacheByUser.get(userId) || [];
          chatManager.addRoomMessage(senderAvatar.roomId || 'global', message);
          socket.emit('chat:message', message);
          for (const nearbyId of nearby) {
            const sid = userToSocket.get(nearbyId);
            if (sid) io.to(sid).emit('chat:message', message);
          }
          break;
        }

        case 'dm':
          if (!recipientId) break;
          chatManager.addRoomMessage(`dm:${[userId, recipientId].sort().join(':')}`, message);
          socket.emit('chat:message', message);
          {
            const sid = userToSocket.get(recipientId);
            if (sid) io.to(sid).emit('chat:message', message);
          }
          break;

        case 'room':
        default:
          if (senderAvatar.roomId) {
            chatManager.addRoomMessage(senderAvatar.roomId, message);
            io.to(`room:${senderAvatar.roomId}`).emit('chat:message', message);
          } else {
            socket.emit('chat:message', message);
          }
          break;
      }
    });

    socket.on('room:history', ({ roomId } = {}) => {
      if (!roomId) return;
      const history = chatManager.getRoomHistory(roomId);
      socket.emit('chat:history', { roomId, messages: history });
    });

    socket.on('disconnect', () => {
      socketToUser.delete(socket.id);
      userToSocket.delete(userId);
      movementIntentByUser.delete(userId);
      nearbyCacheByUser.delete(userId);
      avatarManager.despawn(userId);
      io.emit('avatar:left', { userId });
    });
  });

  io.on('close', () => clearInterval(interval));
}

function normalizeDirection(direction) {
  if (!direction || typeof direction.x !== 'number' || typeof direction.y !== 'number') {
    return null;
  }
  const mag = Math.hypot(direction.x, direction.y);
  if (!mag) return null;
  return { x: direction.x / mag, y: direction.y / mag };
}

function sanitizeTarget(target) {
  if (!target) return null;
  const x = Number(target.x);
  const y = Number(target.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function arrayEqual(a, b) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

module.exports = { registerSocketHandlers };
