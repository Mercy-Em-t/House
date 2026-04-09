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

  /** Serialise to a plain object suitable for sending to clients. */
  toJSON() {
    return {
      bounds: this.bounds,
      rooms: this.getRooms(),
    };
  }
}

module.exports = new WorldEngine();
