/**
 * House Virtual Workspace – World Engine
 *
 * Defines the building layout: rooms, walls, spawn points.
 *
 * Coordinate system
 * ─────────────────
 * (x, y, z)  — z is always 0 in 2D/web mode.
 * In a future 3D / Unity build, z represents elevation.
 * All dimensions are in "world units" (1 wu = 1 px in 2D canvas).
 *
 * Room shape is an axis-aligned bounding box (AABB) described by
 * { x, y, width, height }  where (x, y) is the top-left corner.
 */
'use strict';

const config = require('../config');

// ── Default world layout ──────────────────────────────────────────────────────

/**
 * @typedef {Object} Room
 * @property {string}   id
 * @property {string}   name
 * @property {string}   type        – 'lobby' | 'office' | 'meeting' | 'lounge' | 'ai-hub'
 * @property {{ x: number, y: number, width: number, height: number }} bounds
 * @property {{ x: number, y: number, z: number }}                    spawnPoint
 * @property {number}   maxCapacity
 * @property {string}   color       – display colour for the 2D renderer
 * @property {boolean}  aiEnabled   – whether AI agents may inhabit this room
 */

const DEFAULT_ROOMS = [
  {
    id: 'lobby',
    name: 'Main Lobby',
    type: 'lobby',
    bounds: { x: 0, y: 0, width: 1200, height: 200 },
    spawnPoint: { x: 600, y: 100, z: 0 },
    maxCapacity: 100,
    color: '#e8f4f8',
    aiEnabled: false,
  },
  {
    id: 'open-office',
    name: 'Open Office',
    type: 'office',
    bounds: { x: 0, y: 200, width: 600, height: 300 },
    spawnPoint: { x: 300, y: 350, z: 0 },
    maxCapacity: 30,
    color: '#f0f7e6',
    aiEnabled: true,
  },
  {
    id: 'meeting-room-a',
    name: 'Meeting Room A',
    type: 'meeting',
    bounds: { x: 600, y: 200, width: 300, height: 300 },
    spawnPoint: { x: 750, y: 350, z: 0 },
    maxCapacity: 10,
    color: '#fff3e0',
    aiEnabled: true,
  },
  {
    id: 'meeting-room-b',
    name: 'Meeting Room B',
    type: 'meeting',
    bounds: { x: 900, y: 200, width: 300, height: 300 },
    spawnPoint: { x: 1050, y: 350, z: 0 },
    maxCapacity: 10,
    color: '#fce4ec',
    aiEnabled: true,
  },
  {
    id: 'lounge',
    name: 'Lounge',
    type: 'lounge',
    bounds: { x: 0, y: 500, width: 400, height: 300 },
    spawnPoint: { x: 200, y: 650, z: 0 },
    maxCapacity: 20,
    color: '#f3e5f5',
    aiEnabled: false,
  },
  {
    id: 'ai-hub',
    name: 'AI Hub',
    type: 'ai-hub',
    bounds: { x: 400, y: 500, width: 800, height: 300 },
    spawnPoint: { x: 800, y: 650, z: 0 },
    maxCapacity: 50,
    color: '#e3f2fd',
    aiEnabled: true,
  },
];

// ── World engine ──────────────────────────────────────────────────────────────

class WorldEngine {
  constructor() {
    /** @type {Map<string, Room>} */
    this.rooms = new Map(DEFAULT_ROOMS.map((r) => [r.id, r]));

    this.bounds = {
      width: config.world.width,
      height: config.world.height,
    };
  }

  /** Return all rooms as an array. */
  getRooms() {
    return Array.from(this.rooms.values());
  }

  /** Return a single room by id, or null. */
  getRoom(id) {
    return this.rooms.get(id) || null;
  }

  /**
   * Determine which room a given (x, y) position falls inside.
   * Returns the innermost match, or null for open/corridor space.
   *
   * @param {number} x
   * @param {number} y
   * @returns {Room|null}
   */
  getRoomAt(x, y) {
    let match = null;
    let smallestArea = Infinity;

    for (const room of this.rooms.values()) {
      const { bounds } = room;
      if (
        x >= bounds.x &&
        x <= bounds.x + bounds.width &&
        y >= bounds.y &&
        y <= bounds.y + bounds.height
      ) {
        const area = bounds.width * bounds.height;
        if (area < smallestArea) {
          smallestArea = area;
          match = room;
        }
      }
    }

    return match;
  }

  /**
   * Clamp a position so it stays within the world boundary.
   *
   * @param {{ x: number, y: number }} pos
   * @returns {{ x: number, y: number }}
   */
  clampPosition(pos) {
    return {
      x: Math.max(0, Math.min(this.bounds.width, pos.x)),
      y: Math.max(0, Math.min(this.bounds.height, pos.y)),
    };
  }

  /**
   * Clamp with avatar radius and provide collision information.
   *
   * @param {{ x: number, y: number }} current
   * @param {{ x: number, y: number }} next
   * @param {{ radius?: number }} [opts]
   * @returns {{ x: number, y: number, collided: boolean }}
   */
  resolveMovement(current, next, opts = {}) {
    const radius = Math.max(0, Number(opts.radius) || 0);
    const minX = radius;
    const minY = radius;
    const maxX = this.bounds.width - radius;
    const maxY = this.bounds.height - radius;

    const clampedX = Math.max(minX, Math.min(maxX, next.x));
    const clampedY = Math.max(minY, Math.min(maxY, next.y));
    const collided = clampedX !== next.x || clampedY !== next.y;

    // brief slide correction: only keep one-axis progress when edge-colliding
    if (collided) {
      const slideX = Math.max(minX, Math.min(maxX, next.x));
      const slideY = Math.max(minY, Math.min(maxY, current.y));
      const xOnlyDelta = Math.abs(slideX - current.x) + Math.abs(slideY - current.y);

      const slide2X = Math.max(minX, Math.min(maxX, current.x));
      const slide2Y = Math.max(minY, Math.min(maxY, next.y));
      const yOnlyDelta = Math.abs(slide2X - current.x) + Math.abs(slide2Y - current.y);

      if (xOnlyDelta > yOnlyDelta) {
        return { x: slideX, y: slideY, collided: true };
      }
      return { x: slide2X, y: slide2Y, collided: true };
    }

    return { x: clampedX, y: clampedY, collided: false };
  }

  /**
   * Return all avatars within `proximityRadius` world units of (x, y),
   * excluding the requester's own id.
   *
   * @param {{ x: number, y: number }} pos
   * @param {string} excludeId
   * @param {Array<{ id: string, x: number, y: number }>} allAvatars
   * @param {number} [radius]
   * @returns {Array}
   */
  getNearbyAvatars(pos, excludeId, allAvatars, radius = config.world.proximityRadius) {
    return allAvatars.filter((a) => {
      if (a.id === excludeId) return false;
      const dx = a.x - pos.x;
      const dy = a.y - pos.y;
      return Math.sqrt(dx * dx + dy * dy) <= radius;
    });
  }

  /**
   * Proximity IDs with hysteresis to avoid flicker near threshold edges.
   *
   * @param {{ x:number, y:number }} pos
   * @param {string} excludeId
   * @param {Array<{id:string,x:number,y:number}>} allAvatars
   * @param {string[]} previousIds
   * @param {number} [enterRadius]
   * @param {number} [exitRadius]
   * @returns {string[]}
   */
  getNearbyAvatarIdsWithHysteresis(
    pos,
    excludeId,
    allAvatars,
    previousIds = [],
    enterRadius = config.world.proximityRadius,
    exitRadius = config.world.proximityRadius + config.world.proximityHysteresis
  ) {
    const prevSet = new Set(previousIds);
    const next = [];

    for (const avatar of allAvatars) {
      if (avatar.id === excludeId) continue;
      const dx = avatar.x - pos.x;
      const dy = avatar.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const limit = prevSet.has(avatar.id) ? exitRadius : enterRadius;
      if (dist <= limit) next.push(avatar.id);
    }

    return next;
  }

  /** Serialise to a plain object suitable for sending to clients. */
  toJSON() {
    return {
      bounds: this.bounds,
      rooms: this.getRooms(),
    };
  }
}

module.exports = new WorldEngine();
