/**
 * Backend tests using Node.js built-in test runner.
 *
 * Covers:
 *  – World Engine: room lookup, position clamping, proximity
 *  – Avatar Manager: spawn, move, despawn, commands
 *  – Auth Router: register / login / duplicate email
 *  – Chat Manager: message building and history
 */
'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const crypto = require('node:crypto');

// ── Helpers ───────────────────────────────────────────────────────────────────
function post(url, body, headers = {}) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function get(url, headers = {}) {
  return fetch(url, { headers });
}

// ── World Engine Tests ────────────────────────────────────────────────────────
describe('WorldEngine', () => {
  const worldEngine = require('./world/worldEngine');

  it('returns all 6 default rooms', () => {
    const rooms = worldEngine.getRooms();
    assert.equal(rooms.length, 6);
  });

  it('finds room by id', () => {
    const lobby = worldEngine.getRoom('lobby');
    assert.ok(lobby);
    assert.equal(lobby.name, 'Main Lobby');
    assert.equal(lobby.type, 'lobby');
  });

  it('returns null for unknown room id', () => {
    assert.equal(worldEngine.getRoom('nonexistent'), null);
  });

  it('getRoomAt finds correct room for position', () => {
    // Lobby bounds: x:0,y:0,w:1200,h:200
    const room = worldEngine.getRoomAt(600, 100);
    assert.ok(room);
    assert.equal(room.id, 'lobby');
  });

  it('getRoomAt returns null for position outside all rooms', () => {
    // There's no corridor in the default layout but let's check a boundary
    const room = worldEngine.getRoomAt(-10, -10);
    assert.equal(room, null);
  });

  it('clampPosition keeps coordinates within world bounds', () => {
    const clamped = worldEngine.clampPosition({ x: -50, y: 9999 });
    assert.equal(clamped.x, 0);
    assert.equal(clamped.y, 800); // world height is 800
  });

  it('getNearbyAvatars filters by radius and excludes self', () => {
    const avatars = [
      { id: 'me', x: 100, y: 100 },
      { id: 'close', x: 110, y: 110 },   // within 120wu radius
      { id: 'far', x: 600, y: 600 },      // too far
    ];
    const nearby = worldEngine.getNearbyAvatars({ x: 100, y: 100 }, 'me', avatars);
    assert.equal(nearby.length, 1);
    assert.equal(nearby[0].id, 'close');
  });
});

// ── Avatar Manager Tests ──────────────────────────────────────────────────────
describe('AvatarManager', () => {
  // Reset the avatar map before each group by requiring a fresh instance
  // (Node caches modules, so we work with the singleton directly)
  const avatarManager = require('./avatar/avatarManager');

  before(() => {
    // Clean up any leftover avatars
    for (const a of avatarManager.getAll()) avatarManager.despawn(a.id);
  });

  it('spawns an avatar in the lobby', () => {
    const avatar = avatarManager.spawn({
      userId: 'user-1',
      username: 'Alice',
      avatarColor: '#f00',
    });
    assert.equal(avatar.userId, 'user-1');
    assert.equal(avatar.username, 'Alice');
    assert.equal(avatar.roomId, 'lobby');
    assert.equal(avatar.isAI, false);
  });

  it('retrieves a spawned avatar', () => {
    const avatar = avatarManager.get('user-1');
    assert.ok(avatar);
    assert.equal(avatar.username, 'Alice');
  });

  it('moves avatar and updates room', () => {
    // Move into open office bounds (x: 0-600, y: 200-500)
    const avatar = avatarManager.move('user-1', { x: 300, y: 350 });
    assert.ok(avatar);
    assert.equal(avatar.x, 300);
    assert.equal(avatar.y, 350);
    assert.equal(avatar.roomId, 'open-office');
    assert.equal(avatar.state, 'moving');
  });

  it('sets avatar to idle', () => {
    avatarManager.setIdle('user-1');
    const avatar = avatarManager.get('user-1');
    assert.equal(avatar.state, 'idle');
  });

  it('applies TELEPORT command', () => {
    const avatar = avatarManager.applyCommand('user-1', {
      type: 'TELEPORT',
      payload: { roomId: 'ai-hub' },
    });
    assert.ok(avatar);
    assert.equal(avatar.roomId, 'ai-hub');
  });

  it('applies SET_STATE command', () => {
    const avatar = avatarManager.applyCommand('user-1', {
      type: 'SET_STATE',
      payload: { state: 'interacting' },
    });
    assert.ok(avatar);
    assert.equal(avatar.state, 'interacting');
  });

  it('returns null for command on nonexistent avatar', () => {
    const result = avatarManager.applyCommand('ghost', { type: 'MOVE', payload: { x: 0, y: 0 } });
    assert.equal(result, null);
  });

  it('spawns AI avatar', () => {
    const avatar = avatarManager.spawn({
      userId: 'ai-1',
      username: 'Aria (AI)',
      avatarColor: '#9b59b6',
      isAI: true,
    });
    assert.equal(avatar.isAI, true);
  });

  it('getInRoom returns only avatars in that room', () => {
    // Move user-1 to lobby first
    avatarManager.applyCommand('user-1', { type: 'TELEPORT', payload: { roomId: 'lobby' } });
    const lobbyAvatars = avatarManager.getInRoom('lobby');
    assert.ok(lobbyAvatars.every((a) => a.roomId === 'lobby'));
  });

  it('despawns avatar', () => {
    avatarManager.despawn('user-1');
    assert.equal(avatarManager.get('user-1'), null);
  });
});

// ── Chat Manager Tests ────────────────────────────────────────────────────────
describe('ChatManager', () => {
  const chatManager = require('./communication/chatManager');

  it('builds a room message', () => {
    const msg = chatManager.buildMessage({
      type: 'room',
      senderId: 'u1',
      senderName: 'Alice',
      content: 'Hello room!',
      roomId: 'lobby',
    });
    assert.equal(msg.type, 'room');
    assert.equal(msg.content, 'Hello room!');
    assert.ok(msg.id);
    assert.ok(msg.timestamp);
  });

  it('stores and retrieves room history', () => {
    const msg = chatManager.buildMessage({
      type: 'room',
      senderId: 'u1',
      senderName: 'Alice',
      content: 'Test message',
      roomId: 'open-office',
    });
    chatManager.addRoomMessage('open-office', msg);
    const history = chatManager.getRoomHistory('open-office');
    assert.ok(history.length >= 1);
    assert.equal(history[history.length - 1].content, 'Test message');
  });

  it('returns empty history for room with no messages', () => {
    const history = chatManager.getRoomHistory('meeting-room-a');
    assert.equal(history.length, 0);
  });

  it('respects limit in getRoomHistory', () => {
    // Add 10 messages
    for (let i = 0; i < 10; i++) {
      const msg = chatManager.buildMessage({
        type: 'room',
        senderId: 'u1',
        senderName: 'Alice',
        content: `Message ${i}`,
        roomId: 'lounge',
      });
      chatManager.addRoomMessage('lounge', msg);
    }
    const limited = chatManager.getRoomHistory('lounge', 3);
    assert.equal(limited.length, 3);
  });
});

// ── HTTP API Integration Tests ────────────────────────────────────────────────
describe('Monetization', () => {
  const monetizationService = require('./monetization/monetizationService');
  const paymentOrchestrator = require('./monetization/paymentOrchestrator');

  it('credits tokens from confirmed webhook settlement', () => {
    const payload = {
      eventId: 'stripe-event-1',
      reference: 'stripe-ref-1',
      userId: 'mon-user-1',
      tokens: 100,
      currency: 'USD',
      amountMinor: 800,
      status: 'confirmed',
    };
    const timestamp = Date.now();
    const webhookId = 'stripe-hook-1';
    const raw = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET || 'stripe-webhook-dev-secret')
      .update(`${timestamp}.${webhookId}.${raw}`)
      .digest('hex');

    const result = paymentOrchestrator.verifyAndApplyWebhook({
      provider: 'stripe',
      payload,
      signature,
      timestamp,
      webhookId,
    });

    assert.equal(result.applied, true);
    assert.equal(result.wallet.tokenBalance >= 100, true);
  });

  it('rejects replayed webhook id', () => {
    const payload = {
      eventId: 'stripe-event-2',
      reference: 'stripe-ref-2',
      userId: 'mon-user-2',
      tokens: 50,
      currency: 'USD',
      amountMinor: 400,
      status: 'confirmed',
    };
    const timestamp = Date.now();
    const webhookId = 'stripe-hook-2';
    const raw = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET || 'stripe-webhook-dev-secret')
      .update(`${timestamp}.${webhookId}.${raw}`)
      .digest('hex');

    paymentOrchestrator.verifyAndApplyWebhook({
      provider: 'stripe',
      payload,
      signature,
      timestamp,
      webhookId,
    });

    const replay = paymentOrchestrator.verifyAndApplyWebhook({
      provider: 'stripe',
      payload,
      signature,
      timestamp,
      webhookId,
    });

    assert.equal(replay.replay, true);
    assert.equal(replay.applied, false);
  });

  it('enforces room rental and AI subscription checks', () => {
    const userId = 'mon-user-3';
    monetizationService.ensureUserAccount({ userId, username: 'Mon 3' });
    monetizationService.creditTokensFromSettlement({
      userId,
      tokens: 120,
      provider: 'stripe',
      reference: `seed-${Date.now()}`,
      currency: 'USD',
      amountMinor: 960,
    });

    const before = monetizationService.canEnterRoom(userId, 'meeting-room-a');
    assert.equal(before.allow, false);

    const rent = monetizationService.rentRoom({ userId, roomId: 'meeting-room-a', durationMinutes: 60 });
    assert.equal(rent.ok, true);

    const after = monetizationService.canEnterRoom(userId, 'meeting-room-a');
    assert.equal(after.allow, true);

    const aiBefore = monetizationService.chargeAIAction({ userId, tokenCost: 2 });
    assert.equal(aiBefore.ok, false);
    assert.equal(aiBefore.code, 'AI_SUBSCRIPTION_REQUIRED');

    const sub = monetizationService.subscribeAI({ userId, tokenCost: 10, durationDays: 1 });
    assert.equal(sub.ok, true);

    const aiAfter = monetizationService.chargeAIAction({ userId, tokenCost: 2 });
    assert.equal(aiAfter.ok, true);
  });
});

describe('Auth API', () => {
  let server;
  let baseUrl;

  before(async () => {
    // Spin up a fresh express app wired to the auth router
    const cors = require('cors');
    const { router: authRouter } = require('./auth/authRouter');
    const app = express();
    app.use(express.json());
    app.use(cors());
    app.use('/api/auth', authRouter);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('registers a new user', async () => {
    const res = await post(`${baseUrl}/api/auth/register`, {
      username: 'Bob',
      email: 'bob@test.com',
      password: 'secret123',
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.token);
    assert.equal(body.user.username, 'Bob');
    assert.equal(body.user.role, 'admin'); // first registered user
  });

  it('rejects duplicate email', async () => {
    const res = await post(`${baseUrl}/api/auth/register`, {
      username: 'Bob2',
      email: 'bob@test.com',
      password: 'secret123',
    });
    assert.equal(res.status, 409);
  });

  it('logs in with correct credentials', async () => {
    const res = await post(`${baseUrl}/api/auth/login`, {
      email: 'bob@test.com',
      password: 'secret123',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.token);
  });

  it('rejects wrong password', async () => {
    const res = await post(`${baseUrl}/api/auth/login`, {
      email: 'bob@test.com',
      password: 'wrongpassword',
    });
    assert.equal(res.status, 401);
  });

  it('rejects missing fields on register', async () => {
    const res = await post(`${baseUrl}/api/auth/register`, {
      email: 'incomplete@test.com',
    });
    assert.equal(res.status, 400);
  });

  it('returns 401 for /me without token', async () => {
    const res = await get(`${baseUrl}/api/auth/me`);
    assert.equal(res.status, 401);
  });

  it('returns user for /me with valid token', async () => {
    // Get a token first
    const loginRes = await post(`${baseUrl}/api/auth/login`, {
      email: 'bob@test.com',
      password: 'secret123',
    });
    const { token } = await loginRes.json();

    const res = await get(`${baseUrl}/api/auth/me`, {
      Authorization: `Bearer ${token}`,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.user.email, 'bob@test.com');
  });
});
