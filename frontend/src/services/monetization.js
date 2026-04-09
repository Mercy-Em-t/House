import { getToken } from './auth';

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`/api${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) {
    const error = new Error(data.error || 'Request failed');
    error.data = data;
    throw error;
  }
  return data;
}

export function fetchWallet() {
  return request('/tokens/balance');
}

export function createPaymentIntent(provider, tokens = 100) {
  return request('/payments/intent', {
    method: 'POST',
    body: JSON.stringify({ provider, tokens }),
  });
}

export async function simulateWebhookSettlement({ provider, intent }) {
  const timestamp = Date.now();
  const webhookId = `${provider}-webhook-${intent.intentId}`;
  const payload = {
    eventId: `${provider}-evt-${intent.intentId}`,
    reference: intent.intentId,
    userId: intent.userId,
    tokens: intent.tokens,
    currency: intent.currency,
    amountMinor: intent.amountMinor,
    status: 'confirmed',
  };

  // Dev helper endpoint expects a provider-signed signature; this intentionally
  // calls without one in client flow and lets backend reject outside trusted flow.
  // Frontend then gives user guidance to complete server-side webhook simulation.
  return request(`/payments/webhook/${provider}`, {
    method: 'POST',
    headers: {
      'x-signature': '',
      'x-timestamp': String(timestamp),
      'x-webhook-id': webhookId,
    },
    body: JSON.stringify(payload),
  });
}

export function fetchAISubscription() {
  return request('/subscription/ai');
}

export function subscribeAI(plan = { planId: 'ai-basic', durationDays: 30, tokenCost: 25 }) {
  return request('/subscription/ai', {
    method: 'POST',
    body: JSON.stringify(plan),
  });
}

export function fetchRoomPolicy(roomId) {
  return request(`/room/policy/${encodeURIComponent(roomId)}`);
}

export function rentRoom(roomId, durationMinutes = 60) {
  return request('/room/rent', {
    method: 'POST',
    body: JSON.stringify({ roomId, durationMinutes }),
  });
}

export function fetchLedger(limit = 20) {
  return request(`/ledger/me?limit=${encodeURIComponent(limit)}`);
}
