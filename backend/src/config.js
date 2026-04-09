/**
 * House Virtual Workspace – Configuration
 *
 * Centralises all environment-driven settings so the rest of the
 * codebase stays free of process.env references.
 */
'use strict';

const config = {
  port: process.env.PORT || 4000,

  jwt: {
    secret: process.env.JWT_SECRET || 'house-dev-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  },

  bcrypt: {
    saltRounds: 10,
  },

  world: {
    // Default building dimensions (world units).
    // These map 1-to-1 with canvas pixels in 2D mode and to metres in 3D mode.
    width: 1200,
    height: 800,

    // Proximity radius (world units) for voice/chat activation
    proximityRadius: 120,
    proximityHysteresis: 16,

    // Authoritative simulation tick (Hz)
    tickRate: 20,

    movement: {
      defaultSpeed: 220, // world units / second
      maxSpeed: 380,
      gridStep: 40,
      collisionSlideTicks: 5,
    },
  },
};

module.exports = config;
