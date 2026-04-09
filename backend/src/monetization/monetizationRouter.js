'use strict';

const express = require('express');
const { authenticate } = require('../auth/authMiddleware');
const paymentOrchestrator = require('./paymentOrchestrator');
const monetizationService = require('./monetizationService');
const worldEngine = require('../world/worldEngine');

const paymentsRouter = express.Router();
const tokensRouter = express.Router();
const subscriptionRouter = express.Router();
const roomRouter = express.Router();
const ledgerRouter = express.Router();

function normalizeError(res, error) {
  return res.status(400).json({
    ok: false,
    error: error?.message || 'Request failed',
  });
}

paymentsRouter.post('/intent', authenticate, (req, res) => {
  try {
    const { provider, tokens, currency } = req.body || {};
    const intent = paymentOrchestrator.createPaymentIntent({
      provider,
      userId: req.userId,
      tokens,
      currency,
    });
    return res.status(201).json({ ok: true, intent });
  } catch (error) {
    return normalizeError(res, error);
  }
});

paymentsRouter.post('/webhook/:provider', (req, res) => {
  try {
    const signature = req.headers['x-signature'];
    const timestamp = req.headers['x-timestamp'];
    const webhookId = req.headers['x-webhook-id'];
    const outcome = paymentOrchestrator.verifyAndApplyWebhook({
      provider: req.params.provider,
      payload: req.body || {},
      signature,
      timestamp,
      webhookId,
    });
    return res.json({ ok: true, outcome });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message });
  }
});

tokensRouter.use(authenticate);

tokensRouter.get('/balance', (req, res) => {
  monetizationService.ensureUserAccount({ userId: req.userId, username: req.userEmail, email: req.userEmail });
  const wallet = monetizationService.getWallet(req.userId);
  const transactions = monetizationService.getLedgerForAccount(req.userId, 20);
  return res.json({ ok: true, wallet, transactions });
});

tokensRouter.post('/refund', (req, res) => {
  try {
    const { tokens, reason } = req.body || {};
    const result = monetizationService.refundTokens({ userId: req.userId, tokens, reason });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return normalizeError(res, error);
  }
});

subscriptionRouter.use(authenticate);

subscriptionRouter.get('/ai', (req, res) => {
  const status = monetizationService.getAISubscription(req.userId);
  return res.json({ ok: true, ...status });
});

subscriptionRouter.post('/ai', (req, res) => {
  const { businessId, planId, durationDays, tokenCost } = req.body || {};
  const result = monetizationService.subscribeAI({
    userId: req.userId,
    businessId,
    planId,
    durationDays,
    tokenCost,
  });

  if (!result.ok) {
    return res.status(402).json({ ok: false, ...result });
  }

  return res.status(201).json({ ok: true, ...result });
});

roomRouter.use(authenticate);

roomRouter.get('/policy/:roomId', (req, res) => {
  const room = worldEngine.getRoom(req.params.roomId);
  if (!room) return res.status(404).json({ ok: false, error: 'Room not found' });

  const policy = monetizationService.getRoomPolicy(req.params.roomId);
  const entitlement = monetizationService.canEnterRoom(req.userId, req.params.roomId);
  const rentalStatus = monetizationService.getRoomRental(req.userId, req.params.roomId);

  return res.json({
    ok: true,
    room: { id: room.id, name: room.name },
    policy,
    entitlement,
    rentalStatus,
  });
});

roomRouter.post('/rent', (req, res) => {
  const { roomId, durationMinutes } = req.body || {};
  if (!roomId) return res.status(400).json({ ok: false, error: 'roomId is required' });
  if (!worldEngine.getRoom(roomId)) return res.status(404).json({ ok: false, error: 'Room not found' });

  const result = monetizationService.rentRoom({ userId: req.userId, roomId, durationMinutes });
  if (result.ok === false) {
    return res.status(402).json({ ok: false, ...result });
  }

  return res.status(201).json({ ok: true, ...result });
});

roomRouter.post('/ownership', (req, res) => {
  const { roomId, businessName, roomCostTokens, commissionRate } = req.body || {};
  if (!roomId) return res.status(400).json({ ok: false, error: 'roomId is required' });

  const business = monetizationService.ensureBusinessAccount({ ownerUserId: req.userId, name: businessName });
  const policy = monetizationService.setRoomOwnership({
    roomId,
    businessId: business.id,
    roomCostTokens,
    commissionRate,
  });

  return res.status(201).json({ ok: true, business, policy });
});

ledgerRouter.use(authenticate);

ledgerRouter.get('/me', (req, res) => {
  const limit = Number(req.query.limit) || 50;
  return res.json({
    ok: true,
    accountId: req.userId,
    wallet: monetizationService.getWallet(req.userId),
    entries: monetizationService.getLedgerForAccount(req.userId, limit),
  });
});

ledgerRouter.get('/business', (req, res) => {
  const business = monetizationService.ensureBusinessAccount({ ownerUserId: req.userId, name: `Business ${req.userId}` });
  const summary = monetizationService.getBusinessSummary(business.id);
  return res.json({ ok: true, business, summary });
});

module.exports = {
  paymentsRouter,
  tokensRouter,
  subscriptionRouter,
  roomRouter,
  ledgerRouter,
};
