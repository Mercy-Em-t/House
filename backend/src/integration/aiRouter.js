/**
 * House Virtual Workspace – AI Integration Router
 *
 * Provides API endpoints that external AI systems / automation scripts
 * can use to command avatars and inject messages.
 *
 * All endpoints require an `X-Agent-Key` header matching AI_AGENT_KEY
 * (falls back to a dev default when the env var is not set).
 *
 * POST /api/ai/command          – send a command to an avatar
 * POST /api/ai/message          – inject a chat message as an AI avatar
 * POST /api/ai/spawn-agent      – spawn an AI-controlled avatar
 * DELETE /api/ai/despawn-agent/:id – remove an AI avatar
 * GET  /api/ai/world-state       – snapshot of all avatars + rooms
 */
'use strict';

const express = require('express');
const avatarManager = require('../avatar/avatarManager');
const chatManager = require('../communication/chatManager');
const worldEngine = require('../world/worldEngine');
const realtimeOrchestrator = require('../realtime/realtimeOrchestrator');

const router = express.Router();

const AI_AGENT_KEY = process.env.AI_AGENT_KEY || 'house-ai-dev-key';

// ── Auth guard for AI routes ──────────────────────────────────────────────────
function agentAuth(req, res, next) {
  const key = req.headers['x-agent-key'];
  if (!key || key !== AI_AGENT_KEY) {
    return res.status(401).json({ error: 'Invalid or missing X-Agent-Key' });
  }
  next();
}

router.use(agentAuth);

// ── Reference to the Socket.io instance (injected at startup) ─────────────────
let _io = null;
function setIO(io) {
  _io = io;
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /api/ai/command
 * Body: { userId, command: { type, payload } }
 *
 * Command types:
 *   MOVE      – { x, y, z? }
 *   SET_STATE – { state: 'idle'|'moving'|'interacting'|'speaking' }
 *   TELEPORT  – { roomId }
 *   MOVE_TO_USER – { targetUserId, step? }
 *   PATROL_ROOM  – { roomId }
 *   GREET_ON_APPROACH – { durationMs? }
 */
router.post('/command', async (req, res) => {
  const { userId, command } = req.body || {};
  if (!userId || !command) {
    return res.status(400).json({ error: 'userId and command are required' });
  }

  try {
    await realtimeOrchestrator.forwardCommand({ userId, command });
  } catch (error) {
    return res.status(502).json({ error: `Realtime orchestration failed: ${error.message}` });
  }

  const avatar = avatarManager.applyCommand(userId, command);
  if (!avatar) {
    return res.status(404).json({ error: 'Avatar not found' });
  }

  // Broadcast the updated position to all clients
  if (_io) {
    _io.emit('avatar:update', avatar);
  }

  return res.json({ avatar });
});

/**
 * POST /api/ai/message
 * Body: { userId, content, type? ('room'|'global'|'proximity') }
 */
router.post('/message', async (req, res) => {
  const { userId, content, type = 'room' } = req.body || {};
  if (!userId || !content) {
    return res.status(400).json({ error: 'userId and content are required' });
  }

  try {
    await realtimeOrchestrator.forwardMessage({ userId, content, type });
  } catch (error) {
    return res.status(502).json({ error: `Realtime orchestration failed: ${error.message}` });
  }

  const avatar = avatarManager.get(userId);
  if (!avatar) {
    return res.status(404).json({ error: 'Avatar not found' });
  }

  const message = chatManager.buildMessage({
    type,
    senderId: userId,
    senderName: avatar.username,
    content,
    roomId: avatar.roomId,
  });

  if (type === 'global') {
    chatManager.addGlobalMessage(message);
    if (_io) _io.emit('chat:message', message);
  } else {
    if (avatar.roomId) chatManager.addRoomMessage(avatar.roomId, message);
    if (_io && avatar.roomId) {
      _io.to(`room:${avatar.roomId}`).emit('chat:message', message);
    }
  }

  return res.json({ message });
});

/**
 * POST /api/ai/spawn-agent
 * Body: { userId, username, avatarColor? }
 *
 * Creates an AI-controlled avatar. userId must be unique.
 */
router.post('/spawn-agent', async (req, res) => {
  const { userId, username, avatarColor = '#9b59b6' } = req.body || {};
  if (!userId || !username) {
    return res.status(400).json({ error: 'userId and username are required' });
  }

  try {
    await realtimeOrchestrator.forwardSpawn({ userId, username, avatarColor });
  } catch (error) {
    return res.status(502).json({ error: `Realtime orchestration failed: ${error.message}` });
  }

  const avatar = avatarManager.spawn({ userId, username, avatarColor, isAI: true });

  if (_io) {
    _io.emit('avatar:joined', avatar);
  }

  return res.status(201).json({ avatar });
});

/**
 * DELETE /api/ai/despawn-agent/:id
 */
router.delete('/despawn-agent/:id', async (req, res) => {
  const { id } = req.params;
  const avatar = avatarManager.get(id);
  if (!avatar || !avatar.isAI) {
    return res.status(404).json({ error: 'AI avatar not found' });
  }

  try {
    await realtimeOrchestrator.forwardDespawn({ userId: id });
  } catch (error) {
    return res.status(502).json({ error: `Realtime orchestration failed: ${error.message}` });
  }

  avatarManager.despawn(id);

  if (_io) {
    _io.emit('avatar:left', { userId: id });
  }

  return res.json({ success: true });
});

/**
 * GET /api/ai/world-state
 *
 * Returns a snapshot of the entire world for AI reasoning.
 */
router.get('/world-state', (_req, res) => {
  res.json({
    world: worldEngine.toJSON(),
    avatars: avatarManager.getAll(),
    timestamp: new Date().toISOString(),
  });
});

module.exports = { router, setIO };
