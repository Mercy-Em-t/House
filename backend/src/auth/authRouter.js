/**
 * House Virtual Workspace – Authentication Router
 *
 * POST /api/auth/register  – create a new account
 * POST /api/auth/login     – authenticate and receive a JWT
 * GET  /api/auth/me        – return current user (authenticated)
 */
'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { authenticate } = require('./authMiddleware');

const router = express.Router();

// ── In-memory user store (swap with a real DB in production) ──────────────────
const users = new Map(); // id → user object

// ── Helpers ───────────────────────────────────────────────────────────────────
function findUserByEmail(email) {
  for (const user of users.values()) {
    if (user.email === email) return user;
  }
  return null;
}

function publicUser(user) {
  const { passwordHash: _ph, ...safe } = user;
  return safe;
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body || {};

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email, and password are required' });
  }

  if (findUserByEmail(email)) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(password, config.bcrypt.saltRounds);
  const user = {
    id: uuidv4(),
    username,
    email,
    passwordHash,
    role: users.size === 0 ? 'admin' : 'user', // first user is admin
    createdAt: new Date().toISOString(),
    avatarColor: `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`,
  };

  users.set(user.id, user);

  return res.status(201).json({
    token: signToken(user),
    user: publicUser(user),
  });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const user = findUserByEmail(email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  return res.json({
    token: signToken(user),
    user: publicUser(user),
  });
});

router.get('/me', authenticate, (req, res) => {
  const user = users.get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({ user: publicUser(user) });
});

module.exports = { router, users };
