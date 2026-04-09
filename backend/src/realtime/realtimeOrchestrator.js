'use strict';

const config = require('../config');

function shouldForward() {
  return config.runtime.mode === 'hybrid' || config.runtime.mode === 'rust';
}

async function forward(path, payload) {
  if (!shouldForward()) {
    return { forwarded: false, mode: config.runtime.mode };
  }

  const url = `${config.runtime.realtimeBaseUrl}${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bridge-key': config.runtime.bridgeKey,
    },
    body: JSON.stringify(payload || {}),
  });

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    console.warn('[RealtimeOrchestrator] Non-JSON response from realtime bridge', {
      path,
      status: response.status,
      error: error.message,
    });
    data = null;
  }

  if (!response.ok) {
    const message = data && data.error ? data.error : `Rust realtime returned ${response.status}`;
    throw new Error(message);
  }

  return { forwarded: true, mode: config.runtime.mode, data };
}

async function forwardCommand(payload) {
  return forward('/bridge/command', payload);
}

async function forwardMessage(payload) {
  return forward('/bridge/message', payload);
}

async function forwardSpawn(payload) {
  return forward('/bridge/spawn-agent', payload);
}

async function forwardDespawn(payload) {
  return forward('/bridge/despawn-agent', payload);
}

module.exports = {
  shouldForward,
  forwardCommand,
  forwardMessage,
  forwardSpawn,
  forwardDespawn,
};
