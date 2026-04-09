'use strict';

const { v4: uuidv4 } = require('uuid');

const PLATFORM_ACCOUNT_ID = 'platform';

class MonetizationService {
  constructor() {
    this.accounts = new Map(); // accountId -> { id, kind, ownerUserId?, name, createdAt }
    this.wallets = new Map(); // accountId -> { tokenBalance }
    this.ledger = []; // append-only
    this.roomOwnership = new Map(); // roomId -> { businessId, roomCostTokens, commissionRate }
    this.roomRentals = new Map(); // userId:roomId -> { userId, roomId, endsAt, paidTokens }
    this.aiSubscriptions = new Map(); // userId -> { userId, businessId, active, expiresAt, planId }
    this.businessesByOwner = new Map(); // ownerUserId -> businessId
    this.processedReferences = new Set(); // payment idempotency references

    this._ensurePlatform();
    this._seedRoomOwnership();
  }

  _ensurePlatform() {
    if (!this.accounts.has(PLATFORM_ACCOUNT_ID)) {
      this.accounts.set(PLATFORM_ACCOUNT_ID, {
        id: PLATFORM_ACCOUNT_ID,
        kind: 'platform',
        name: 'House Platform',
        createdAt: new Date().toISOString(),
      });
      this.wallets.set(PLATFORM_ACCOUNT_ID, { tokenBalance: 0 });
    }
  }

  _seedRoomOwnership() {
    const defaults = [
      { roomId: 'lobby', roomCostTokens: 0 },
      { roomId: 'open-office', roomCostTokens: 10 },
      { roomId: 'meeting-room-a', roomCostTokens: 20 },
      { roomId: 'meeting-room-b', roomCostTokens: 20 },
      { roomId: 'lounge', roomCostTokens: 8 },
      { roomId: 'ai-hub', roomCostTokens: 12 },
    ];

    defaults.forEach(({ roomId, roomCostTokens }) => {
      this.roomOwnership.set(roomId, {
        roomId,
        businessId: null,
        roomCostTokens,
        commissionRate: 0.15,
      });
    });
  }

  _wallet(accountId) {
    if (!this.wallets.has(accountId)) {
      this.wallets.set(accountId, { tokenBalance: 0 });
    }
    return this.wallets.get(accountId);
  }

  ensureUserAccount({ userId, username, email }) {
    if (!userId) return null;
    const existing = this.accounts.get(userId);
    if (existing) return existing;

    const account = {
      id: userId,
      kind: 'user',
      username: username || email || userId,
      email: email || null,
      createdAt: new Date().toISOString(),
    };
    this.accounts.set(userId, account);
    this._wallet(userId);
    return account;
  }

  ensureBusinessAccount({ ownerUserId, name }) {
    this.ensureUserAccount({ userId: ownerUserId, username: ownerUserId });
    const existingId = this.businessesByOwner.get(ownerUserId);
    if (existingId && this.accounts.has(existingId)) return this.accounts.get(existingId);

    const id = `biz-${uuidv4().slice(0, 8)}`;
    const business = {
      id,
      kind: 'business',
      ownerUserId,
      name: name || `Business ${ownerUserId}`,
      createdAt: new Date().toISOString(),
    };
    this.accounts.set(id, business);
    this.businessesByOwner.set(ownerUserId, id);
    this._wallet(id);
    return business;
  }

  getWallet(accountId) {
    return { accountId, ...this._wallet(accountId) };
  }

  getRoomPolicy(roomId) {
    return this.roomOwnership.get(roomId) || {
      roomId,
      businessId: null,
      roomCostTokens: 0,
      commissionRate: 0.15,
    };
  }

  setRoomOwnership({ roomId, businessId, roomCostTokens, commissionRate }) {
    if (!roomId) throw new Error('roomId is required');
    const current = this.getRoomPolicy(roomId);
    const next = {
      roomId,
      businessId: businessId ?? current.businessId,
      roomCostTokens: Number.isFinite(Number(roomCostTokens)) ? Math.max(0, Math.floor(Number(roomCostTokens))) : current.roomCostTokens,
      commissionRate: Number.isFinite(Number(commissionRate)) ? clamp(Number(commissionRate), 0, 1) : current.commissionRate,
    };
    this.roomOwnership.set(roomId, next);
    if (next.businessId) this._wallet(next.businessId);
    return next;
  }

  _appendLedger({ type, description, metadata, postings }) {
    const entry = {
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      type,
      description,
      metadata: metadata || {},
      postings: postings.map((p) => ({
        accountId: p.accountId,
        deltaTokens: Number(p.deltaTokens),
      })),
    };

    for (const posting of entry.postings) {
      const wallet = this._wallet(posting.accountId);
      wallet.tokenBalance += posting.deltaTokens;
    }

    this.ledger.push(entry);
    return entry;
  }

  getLedgerForAccount(accountId, limit = 50) {
    return this.ledger
      .filter((entry) => entry.postings.some((p) => p.accountId === accountId))
      .slice(-Math.max(1, Math.min(500, Number(limit) || 50)))
      .reverse();
  }

  getPlatformLedger(limit = 100) {
    return this.getLedgerForAccount(PLATFORM_ACCOUNT_ID, limit);
  }

  creditTokensFromSettlement({ userId, tokens, provider, reference, currency = 'USD', amountMinor = 0 }) {
    this.ensureUserAccount({ userId, username: userId });
    const normalizedReference = `${provider}:${reference}`;
    if (this.processedReferences.has(normalizedReference)) {
      return { idempotent: true, ledgerEntry: null, wallet: this.getWallet(userId) };
    }

    const tokenAmount = Math.max(0, Math.floor(Number(tokens) || 0));
    if (tokenAmount <= 0) throw new Error('tokens must be greater than 0');

    const entry = this._appendLedger({
      type: 'TOKEN_PURCHASE',
      description: `Token purchase via ${provider}`,
      metadata: { userId, provider, reference, currency, amountMinor },
      postings: [
        { accountId: userId, deltaTokens: tokenAmount },
        { accountId: PLATFORM_ACCOUNT_ID, deltaTokens: tokenAmount },
      ],
    });

    this.processedReferences.add(normalizedReference);
    return { idempotent: false, ledgerEntry: entry, wallet: this.getWallet(userId) };
  }

  refundTokens({ userId, tokens, reason = 'refund' }) {
    this.ensureUserAccount({ userId, username: userId });
    const tokenAmount = Math.max(0, Math.floor(Number(tokens) || 0));
    if (tokenAmount <= 0) throw new Error('tokens must be greater than 0');

    const platformWallet = this._wallet(PLATFORM_ACCOUNT_ID);
    if (platformWallet.tokenBalance < tokenAmount) throw new Error('platform liquidity insufficient');

    const entry = this._appendLedger({
      type: 'TOKEN_REFUND',
      description: 'Token refund',
      metadata: { userId, reason },
      postings: [
        { accountId: userId, deltaTokens: tokenAmount },
        { accountId: PLATFORM_ACCOUNT_ID, deltaTokens: -tokenAmount },
      ],
    });

    return { ledgerEntry: entry, wallet: this.getWallet(userId) };
  }

  rentRoom({ userId, roomId, durationMinutes = 60, now = Date.now() }) {
    this.ensureUserAccount({ userId, username: userId });
    const policy = this.getRoomPolicy(roomId);
    const cost = Number(policy.roomCostTokens) || 0;

    if (cost <= 0) {
      const endsAt = new Date(now + Number(durationMinutes) * 60 * 1000).toISOString();
      this.roomRentals.set(`${userId}:${roomId}`, { userId, roomId, endsAt, paidTokens: 0 });
      return { costTokens: 0, endsAt, wallet: this.getWallet(userId), policy };
    }

    const userWallet = this._wallet(userId);
    if (userWallet.tokenBalance < cost) {
      return {
        ok: false,
        code: 'INSUFFICIENT_TOKENS',
        message: 'Insufficient tokens for room rental',
        required: cost,
        balance: userWallet.tokenBalance,
      };
    }

    const commission = Math.floor(cost * policy.commissionRate);
    const businessShare = cost - commission;
    const businessAccountId = policy.businessId || PLATFORM_ACCOUNT_ID;

    const postings = [
      { accountId: userId, deltaTokens: -cost },
      { accountId: PLATFORM_ACCOUNT_ID, deltaTokens: commission },
    ];
    if (businessShare > 0) postings.push({ accountId: businessAccountId, deltaTokens: businessShare });

    const entry = this._appendLedger({
      type: 'ROOM_RENTAL',
      description: `Room rental for ${roomId}`,
      metadata: { userId, roomId, cost, commissionRate: policy.commissionRate, businessAccountId },
      postings,
    });

    const endsAt = new Date(now + Number(durationMinutes) * 60 * 1000).toISOString();
    this.roomRentals.set(`${userId}:${roomId}`, { userId, roomId, endsAt, paidTokens: cost, ledgerEntryId: entry.id });

    return { ok: true, costTokens: cost, endsAt, wallet: this.getWallet(userId), policy, ledgerEntry: entry };
  }

  getRoomRental(userId, roomId, now = Date.now()) {
    const rental = this.roomRentals.get(`${userId}:${roomId}`);
    if (!rental) return { active: false, rental: null };
    const active = now <= Date.parse(rental.endsAt);
    return {
      active,
      rental,
      remainingSeconds: active ? Math.max(0, Math.ceil((Date.parse(rental.endsAt) - now) / 1000)) : 0,
    };
  }

  canEnterRoom(userId, roomId, now = Date.now()) {
    const policy = this.getRoomPolicy(roomId);
    if ((Number(policy.roomCostTokens) || 0) <= 0) {
      return { allow: true, reason: null, policy, rental: null };
    }

    const status = this.getRoomRental(userId, roomId, now);
    if (!status.active) {
      return {
        allow: false,
        reason: 'RENTAL_REQUIRED',
        message: 'Active rental required for this room',
        policy,
        rental: status.rental,
      };
    }

    return { allow: true, reason: null, policy, rental: status.rental, remainingSeconds: status.remainingSeconds };
  }

  subscribeAI({ userId, businessId = PLATFORM_ACCOUNT_ID, planId = 'ai-basic', durationDays = 30, tokenCost = 25, now = Date.now() }) {
    this.ensureUserAccount({ userId, username: userId });
    const cost = Math.max(0, Math.floor(Number(tokenCost) || 0));

    const userWallet = this._wallet(userId);
    if (userWallet.tokenBalance < cost) {
      return {
        ok: false,
        code: 'INSUFFICIENT_TOKENS',
        message: 'Insufficient tokens for AI subscription',
        required: cost,
        balance: userWallet.tokenBalance,
      };
    }

    const entry = this._appendLedger({
      type: 'AI_SUBSCRIPTION',
      description: `AI subscription ${planId}`,
      metadata: { userId, businessId, planId, cost },
      postings: [
        { accountId: userId, deltaTokens: -cost },
        { accountId: PLATFORM_ACCOUNT_ID, deltaTokens: cost },
      ],
    });

    const expiresAt = new Date(now + Number(durationDays) * 24 * 60 * 60 * 1000).toISOString();
    const subscription = {
      userId,
      businessId,
      planId,
      active: true,
      expiresAt,
      actionCostTokens: 2,
      subscriptionCostTokens: cost,
      updatedAt: new Date().toISOString(),
      ledgerEntryId: entry.id,
    };
    this.aiSubscriptions.set(userId, subscription);

    return { ok: true, subscription, wallet: this.getWallet(userId), ledgerEntry: entry };
  }

  getAISubscription(userId, now = Date.now()) {
    const sub = this.aiSubscriptions.get(userId);
    if (!sub) return { active: false, subscription: null };
    const active = now <= Date.parse(sub.expiresAt);
    return {
      active,
      subscription: { ...sub, active },
      remainingSeconds: active ? Math.max(0, Math.ceil((Date.parse(sub.expiresAt) - now) / 1000)) : 0,
    };
  }

  chargeAIAction({ userId, businessId = PLATFORM_ACCOUNT_ID, actionType = 'command', tokenCost = 2 }) {
    this.ensureUserAccount({ userId, username: userId });

    const subStatus = this.getAISubscription(userId);
    if (!subStatus.active) {
      return {
        ok: false,
        code: 'AI_SUBSCRIPTION_REQUIRED',
        message: 'Active AI subscription required',
        subscription: subStatus.subscription,
      };
    }

    const cost = Math.max(0, Math.floor(Number(tokenCost) || 0));
    const userWallet = this._wallet(userId);
    if (userWallet.tokenBalance < cost) {
      return {
        ok: false,
        code: 'INSUFFICIENT_TOKENS',
        message: 'Insufficient tokens for AI action',
        required: cost,
        balance: userWallet.tokenBalance,
      };
    }

    const entry = this._appendLedger({
      type: 'AI_USAGE',
      description: `AI ${actionType} usage`,
      metadata: { userId, businessId, actionType, cost },
      postings: [
        { accountId: userId, deltaTokens: -cost },
        { accountId: PLATFORM_ACCOUNT_ID, deltaTokens: Math.floor(cost * 0.25) },
        { accountId: businessId, deltaTokens: cost - Math.floor(cost * 0.25) },
      ],
    });

    return { ok: true, ledgerEntry: entry, wallet: this.getWallet(userId), subscription: subStatus.subscription };
  }

  getBusinessSummary(businessId) {
    const wallet = this.getWallet(businessId);
    const ownedRooms = Array.from(this.roomOwnership.values()).filter((r) => r.businessId === businessId);
    const ledger = this.getLedgerForAccount(businessId, 100);

    return {
      businessId,
      wallet,
      ownedRooms,
      transactions: ledger,
      metrics: {
        revenueEntries: ledger.filter((e) => ['ROOM_RENTAL', 'AI_USAGE'].includes(e.type)).length,
      },
    };
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = new MonetizationService();
module.exports.PLATFORM_ACCOUNT_ID = PLATFORM_ACCOUNT_ID;
