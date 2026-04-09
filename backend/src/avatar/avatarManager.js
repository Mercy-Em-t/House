/**
 * House Virtual Workspace – Avatar Manager
 *
 * Tracks the live state of every connected avatar.
 * Avatars are ephemeral (session-based); persistence can be added
 * by flushing state to a database on update.
 *
 * Position uses a 3-axis coordinate: { x, y, z }
 * z is always 0 in 2D/web mode and becomes meaningful in 3D/Unity mode.
 */
'use strict';

const config = require('../config');
const worldEngine = require('../world/worldEngine');

/** @typedef {{ id: string, userId: string, username: string, avatarColor: string, x: number, y: number, z: number, direction: string, state: string, roomId: string|null, isAI: boolean, connectedAt: string, collisionTicks?: number, stateUntil?: number|null }} Avatar */

class AvatarManager {
  constructor() {
    /** @type {Map<string, Avatar>} */
    this.avatars = new Map();
  }

  /**
   * Spawn or re-spawn an avatar when a user connects.
   *
   * @param {Object} opts
   * @param {string} opts.userId
   * @param {string} opts.username
   * @param {string} opts.avatarColor
   * @param {boolean} [opts.isAI=false]
   * @returns {Avatar}
   */
  spawn({ userId, username, avatarColor, isAI = false }) {
    const lobby = worldEngine.getRoom('lobby');
    const spawn = lobby ? lobby.spawnPoint : { x: 100, y: 100, z: 0 };

    // Slight jitter so multiple users don't stack on the same pixel
    const jitter = () => (Math.random() - 0.5) * 80;

    const avatar = {
      id: userId,
      userId,
      username,
      avatarColor,
      x: spawn.x + jitter(),
      y: spawn.y + jitter(),
      z: spawn.z,
      direction: 'down', // last movement direction for sprite orientation
      state: 'idle',     // idle | moving | interacting | speaking
      roomId: 'lobby',
      isAI,
      collisionTicks: 0,
      stateUntil: null,
      connectedAt: new Date().toISOString(),
    };

    this.avatars.set(userId, avatar);
    return avatar;
  }

  /**
   * Update avatar position and derive current room.
   *
   * @param {string} userId
   * @param {{ x: number, y: number, z?: number, direction?: string }} update
   * @returns {Avatar|null}
   */
  move(userId, { x, y, z = 0, direction }) {
    const avatar = this.avatars.get(userId);
    if (!avatar) return null;

    const clamped = worldEngine.clampPosition({ x, y });
    avatar.x = clamped.x;
    avatar.y = clamped.y;
    avatar.z = z;
    if (direction) avatar.direction = direction;
    avatar.state = 'moving';
    avatar.stateUntil = null;

    // Derive room from new position
    const room = worldEngine.getRoomAt(avatar.x, avatar.y);
    avatar.roomId = room ? room.id : null;

    return avatar;
  }

  /**
   * Mark the avatar as idle (called after movement stops).
   *
   * @param {string} userId
   */
  setIdle(userId) {
    const avatar = this.avatars.get(userId);
    if (avatar) {
      avatar.state = 'idle';
      avatar.stateUntil = null;
    }
  }

  /**
   * @param {string} userId
   * @param {'idle'|'moving'|'interacting'|'speaking'} state
   * @param {number} [durationMs]
   * @returns {Avatar|null}
   */
  setState(userId, state, durationMs = 0) {
    const avatar = this.avatars.get(userId);
    if (!avatar) return null;
    avatar.state = state;
    avatar.stateUntil = durationMs > 0 ? Date.now() + durationMs : null;
    return avatar;
  }

  /**
   * Server-authoritative movement simulation from movement intent.
   *
   * @param {string} userId
   * @param {{ mode?: 'steer'|'tap'|'grid', active?: boolean, direction?: {x:number,y:number}, speed?: number, target?: {x:number,y:number}, z?: number }} intent
   * @param {number} deltaSeconds
   * @returns {Avatar|null}
   */
  simulate(userId, intent, deltaSeconds) {
    const avatar = this.avatars.get(userId);
    if (!avatar) return null;

    // expire temporary states
    if (avatar.stateUntil && Date.now() >= avatar.stateUntil && avatar.state !== 'moving') {
      avatar.state = 'idle';
      avatar.stateUntil = null;
    }

    if (!intent || intent.active === false) {
      if (avatar.state === 'moving') avatar.state = 'idle';
      return avatar;
    }

    const mode = intent.mode || 'steer';
    let dx = Number(intent.direction?.x) || 0;
    let dy = Number(intent.direction?.y) || 0;

    if ((mode === 'tap' || mode === 'grid') && intent.target) {
      dx = intent.target.x - avatar.x;
      dy = intent.target.y - avatar.y;
    }

    const mag = Math.hypot(dx, dy);
    if (!mag) {
      if (avatar.state === 'moving') avatar.state = 'idle';
      return avatar;
    }

    dx /= mag;
    dy /= mag;

    const speed = Math.min(
      Math.max(Number(intent.speed) || config.world.movement.defaultSpeed, 0),
      config.world.movement.maxSpeed
    );
    const step = speed * Math.max(deltaSeconds, 0);

    const next = {
      x: avatar.x + dx * step,
      y: avatar.y + dy * step,
    };
    const resolved = worldEngine.resolveMovement(
      { x: avatar.x, y: avatar.y },
      next,
      { radius: 18 }
    );

    if (resolved.collided) {
      avatar.collisionTicks = (avatar.collisionTicks || 0) + 1;
    } else {
      avatar.collisionTicks = 0;
    }

    // avoid indefinite wall sliding: convert to full stop after brief correction
    if ((avatar.collisionTicks || 0) > config.world.movement.collisionSlideTicks) {
      avatar.state = 'idle';
      return avatar;
    }

    avatar.x = resolved.x;
    avatar.y = resolved.y;
    avatar.z = Number(intent.z) || avatar.z || 0;
    avatar.direction = dominantDirection(dx, dy);
    avatar.state = 'moving';
    avatar.stateUntil = null;

    const room = worldEngine.getRoomAt(avatar.x, avatar.y);
    avatar.roomId = room ? room.id : null;

    // tap/grid stop condition
    if ((mode === 'tap' || mode === 'grid') && intent.target) {
      const dist = Math.hypot(intent.target.x - avatar.x, intent.target.y - avatar.y);
      if (dist <= 8) {
        avatar.state = 'idle';
      }
    }

    return avatar;
  }

  /**
   * Remove an avatar when the user disconnects.
   *
   * @param {string} userId
   */
  despawn(userId) {
    this.avatars.delete(userId);
  }

  /**
   * Return a single avatar by userId, or null.
   *
   * @param {string} userId
   * @returns {Avatar|null}
   */
  get(userId) {
    return this.avatars.get(userId) || null;
  }

  /** Return all avatars as an array. */
  getAll() {
    return Array.from(this.avatars.values());
  }

  /**
   * Return all avatars in a specific room.
   *
   * @param {string} roomId
   * @returns {Avatar[]}
   */
  getInRoom(roomId) {
    return this.getAll().filter((a) => a.roomId === roomId);
  }

  /**
   * Apply an external command to an avatar (used by AI/automation).
   *
   * @param {string} userId
   * @param {{ type: string, payload: object }} command
   * @returns {Avatar|null}
   */
  applyCommand(userId, command) {
    const avatar = this.avatars.get(userId);
    if (!avatar) return null;

    switch (command.type) {
      case 'MOVE':
        return this.move(userId, command.payload);

      case 'SET_STATE':
        return this.setState(userId, command.payload.state || 'idle');

      case 'MOVE_TO_USER': {
        const target = this.avatars.get(command.payload.targetUserId);
        if (!target) return avatar;
        const dx = target.x - avatar.x;
        const dy = target.y - avatar.y;
        const mag = Math.hypot(dx, dy) || 1;
        const step = Number(command.payload.step) || 40;
        return this.move(userId, {
          x: avatar.x + (dx / mag) * step,
          y: avatar.y + (dy / mag) * step,
          z: avatar.z,
        });
      }

      case 'TELEPORT': {
        const room = worldEngine.getRoom(command.payload.roomId);
        if (room) {
          avatar.x = room.spawnPoint.x;
          avatar.y = room.spawnPoint.y;
          avatar.z = room.spawnPoint.z;
          avatar.roomId = room.id;
        }
        return avatar;
      }

      case 'PATROL_ROOM': {
        const room = worldEngine.getRoom(command.payload.roomId);
        if (!room) return avatar;
        const pad = 24;
        const randomX = room.bounds.x + pad + Math.random() * Math.max(1, room.bounds.width - pad * 2);
        const randomY = room.bounds.y + pad + Math.random() * Math.max(1, room.bounds.height - pad * 2);
        return this.move(userId, { x: randomX, y: randomY, z: avatar.z });
      }

      case 'GREET_ON_APPROACH':
        return this.setState(userId, 'interacting', Number(command.payload.durationMs) || 1200);

      default:
        return avatar;
    }
  }
}

function dominantDirection(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'down' : 'up';
}

module.exports = new AvatarManager();
