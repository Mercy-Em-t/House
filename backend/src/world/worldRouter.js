/**
 * House Virtual Workspace – World Router
 *
 * GET /api/world          – full world definition (rooms, bounds)
 * GET /api/world/rooms    – list all rooms
 * GET /api/world/rooms/:id – single room details
 */
'use strict';

const express = require('express');
const { authenticate } = require('../auth/authMiddleware');
const worldEngine = require('./worldEngine');

const router = express.Router();

router.use(authenticate);

router.get('/', (_req, res) => {
  res.json(worldEngine.toJSON());
});

router.get('/rooms', (_req, res) => {
  res.json({ rooms: worldEngine.getRooms() });
});

router.get('/rooms/:id', (req, res) => {
  const room = worldEngine.getRoom(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  return res.json({ room });
});

module.exports = router;
