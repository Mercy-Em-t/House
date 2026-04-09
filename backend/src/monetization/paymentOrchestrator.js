'use strict';

const crypto = require('crypto');
const monetizationService = require('./monetizationService');

const REPLAY_WINDOW_MS = 5 * 60 * 1000;

class PaymentOrchestrator {
  constructor() {
    this.seenWebhooks = new Set();
    this.adapters = {
      stripe: {
        secret: process.env.STRIPE_WEBHOOK_SECRET || 'stripe-webhook-dev-secret',
        normalize: (payload) => ({
          eventId: payload.eventId,
          reference: payload.reference,
          userId: payload.userId,
          tokens: payload.tokens,
          currency: payload.currency || 'USD',
          amountMinor: payload.amountMinor || 0,
          status: payload.status,
        }),
      },
      mpesa: {
        secret: process.env.MPESA_WEBHOOK_SECRET || 'mpesa-webhook-dev-secret',
        normalize: (payload) => ({
          eventId: payload.eventId,
          reference: payload.reference,
          userId: payload.userId,
          tokens: payload.tokens,
          currency: payload.currency || 'KES',
          amountMinor: payload.amountMinor || 0,
          status: payload.status,
        }),
      },
    };
  }

  createPaymentIntent({ provider, userId, tokens, currency }) {
    const normalizedProvider = this._provider(provider);
    const tokenAmount = Math.max(1, Math.floor(Number(tokens) || 0));
    const unitPriceMinor = normalizedProvider === 'mpesa' ? 10 : 8;
    const amountMinor = tokenAmount * unitPriceMinor;

    return {
      intentId: `${normalizedProvider}-intent-${crypto.randomUUID()}`,
      provider: normalizedProvider,
      userId,
      tokens: tokenAmount,
      currency: currency || (normalizedProvider === 'mpesa' ? 'KES' : 'USD'),
      amountMinor,
      status: 'pending_confirmation',
      instructions: 'Complete checkout on provider side, then await webhook confirmation.',
    };
  }

  verifyAndApplyWebhook({ provider, payload, signature, timestamp, webhookId }) {
    const normalizedProvider = this._provider(provider);
    const adapter = this.adapters[normalizedProvider];
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) throw new Error('Invalid webhook timestamp');
    if (Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) throw new Error('Webhook timestamp outside replay window');

    if (!webhookId || typeof webhookId !== 'string') throw new Error('Missing webhook id');
    const uniqueKey = `${normalizedProvider}:${webhookId}`;
    if (this.seenWebhooks.has(uniqueKey)) {
      return { replay: true, applied: false, reason: 'Webhook already processed' };
    }

    const raw = JSON.stringify(payload || {});
    const expected = crypto
      .createHmac('sha256', adapter.secret)
      .update(`${ts}.${webhookId}.${raw}`)
      .digest('hex');

    if (!safeEqualHex(signature, expected)) {
      throw new Error('Invalid webhook signature');
    }

    const event = adapter.normalize(payload || {});
    if (!event.eventId || !event.reference || !event.userId) {
      throw new Error('Invalid webhook payload');
    }
    if (String(event.status || '').toLowerCase() !== 'confirmed') {
      this.seenWebhooks.add(uniqueKey);
      return { replay: false, applied: false, reason: 'Event not settled' };
    }

    const settled = monetizationService.creditTokensFromSettlement({
      userId: event.userId,
      tokens: event.tokens,
      provider: normalizedProvider,
      reference: event.reference,
      currency: event.currency,
      amountMinor: event.amountMinor,
    });

    this.seenWebhooks.add(uniqueKey);

    return {
      replay: false,
      applied: !settled.idempotent,
      idempotent: settled.idempotent,
      wallet: settled.wallet,
      ledgerEntry: settled.ledgerEntry,
    };
  }

  _provider(provider) {
    const normalized = String(provider || '').trim().toLowerCase();
    if (!['stripe', 'mpesa'].includes(normalized)) {
      throw new Error('Unsupported payment provider');
    }
    return normalized;
  }
}

function safeEqualHex(input, expected) {
  if (typeof input !== 'string' || !input) return false;
  const a = Buffer.from(input, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = new PaymentOrchestrator();
module.exports.REPLAY_WINDOW_MS = REPLAY_WINDOW_MS;
