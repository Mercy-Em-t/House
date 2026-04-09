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

const worldEngine = require('../world/worldEngine');

/** @typedef {{ id: string, userId: string, username: string, avatarColor: string, x: number, y: number, z: number, direction: string, state: string, roomId: string|null, isAI: boolean }} Avatar */

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
      state: 'idle',     // idle | walking | busy
      roomId: 'lobby',
      isAI,
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
    avatar.state = 'walking';

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
    if (avatar) avatar.state = 'idle';
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
        avatar.state = command.payload.state || 'idle';
        return avatar;

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

      default:
        return avatar;
    }
  }
}

module.exports = new AvatarManager();
