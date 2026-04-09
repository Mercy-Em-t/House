/**
 * House Virtual Workspace – Chat Manager
 *
 * Manages in-memory message history per room and supports
 * proximity-based direct messages.
 *
 * Message types
 * ─────────────
 *  room      – sent to everyone in the same room
 *  proximity – sent only to avatars within PROXIMITY_RADIUS world units
 *  global    – broadcast to all connected users
 *  dm        – direct message to a specific user
 */
'use strict';

const { v4: uuidv4 } = require('uuid');

const MAX_HISTORY = 200; // messages kept per room before circular eviction

class ChatManager {
  constructor() {
    /** @type {Map<string, Array>}  roomId → message[] */
    this.roomMessages = new Map();

    /** @type {Array} global messages */
    this.globalMessages = [];
  }

  /**
   * Build a message object.
   *
   * @param {Object} opts
   * @param {'room'|'proximity'|'global'|'dm'} opts.type
   * @param {string}  opts.senderId
   * @param {string}  opts.senderName
   * @param {string}  opts.content
   * @param {string}  [opts.roomId]
   * @param {string}  [opts.recipientId]
   * @returns {Object}
   */
  buildMessage({ type, senderId, senderName, content, roomId, recipientId }) {
    return {
      id: uuidv4(),
      type,
      senderId,
      senderName,
      content,
      roomId: roomId || null,
      recipientId: recipientId || null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Store a room message and return it.
   *
   * @param {string} roomId
   * @param {Object} message
   * @returns {Object}
   */
  addRoomMessage(roomId, message) {
    if (!this.roomMessages.has(roomId)) {
      this.roomMessages.set(roomId, []);
    }
    const history = this.roomMessages.get(roomId);
    history.push(message);
    if (history.length > MAX_HISTORY) history.shift();
    return message;
  }

  /**
   * Get recent message history for a room.
   *
   * @param {string} roomId
   * @param {number} [limit=50]
   * @returns {Array}
   */
  getRoomHistory(roomId, limit = 50) {
    const history = this.roomMessages.get(roomId) || [];
    return history.slice(-limit);
  }

  /**
   * Store a global message.
   *
   * @param {Object} message
   * @returns {Object}
   */
  addGlobalMessage(message) {
    this.globalMessages.push(message);
    if (this.globalMessages.length > MAX_HISTORY) this.globalMessages.shift();
    return message;
  }
}

module.exports = new ChatManager();
