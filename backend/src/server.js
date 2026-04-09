/**
 * House Virtual Workspace – Main Server
 *
 * Starts the HTTP + WebSocket server and mounts all API routers.
 */
'use strict';

const http = require('http');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Server: SocketIOServer } = require('socket.io');

const config = require('./config');
const { router: authRouter } = require('./auth/authRouter');
const worldRouter = require('./world/worldRouter');
const { router: aiRouter, setIO } = require('./integration/aiRouter');
const { registerSocketHandlers } = require('./socket/socketHandler');
const {
  paymentsRouter,
  tokensRouter,
  subscriptionRouter,
  roomRouter,
  ledgerRouter,
} = require('./monetization/monetizationRouter');
const { PROTOCOL_VERSION } = require('../../shared/protocol');

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();

app.use(cors(config.cors));
app.use(express.json());

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Strict limit for auth endpoints (prevent brute-force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// General API limit
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Health-check endpoint (useful for load balancers / monitoring)
app.get('/health', (_req, res) =>
  res.json({
    status: 'ok',
    mode: config.runtime.mode,
    protocolVersion: PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
  })
);

// API routes
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/world', apiLimiter, worldRouter);
app.use('/api/ai', apiLimiter, aiRouter);
app.use('/api/payments', apiLimiter, paymentsRouter);
app.use('/api/tokens', apiLimiter, tokensRouter);
app.use('/api/subscription', apiLimiter, subscriptionRouter);
app.use('/api/room', apiLimiter, roomRouter);
app.use('/api/ledger', apiLimiter, ledgerRouter);

// Generic 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ── HTTP + Socket.io server ───────────────────────────────────────────────────
const httpServer = http.createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: config.cors,
  transports: ['websocket', 'polling'],
});

// Inject io into the AI router so it can broadcast events
setIO(io);

// Register all real-time event handlers
registerSocketHandlers(io);

// ── Start listening ────────────────────────────────────────────────────────────
const { port } = config;
httpServer.listen(port, () => {
  console.log(`🏠 House backend running on http://localhost:${port}`);
  console.log(`   WebSocket server ready`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app, httpServer };
