import React, { useRef, useEffect, useCallback } from 'react';
import config from '../../config.js';

/**
 * WorldCanvas
 *
 * Renders the virtual world using an HTML5 Canvas element.
 *
 * Architecture notes for future 3D/Unity upgrade:
 * ─────────────────────────────────────────────────
 * - All positions are stored in "world units" (wu). The canvas scales them.
 * - The renderer is intentionally separated from movement logic so it can be
 *   replaced with a Three.js / Babylon.js / Unity WebGL renderer without
 *   changing the Socket.io layer or the WorldView state management.
 * - Avatar direction maps to ['up','down','left','right'] which will translate
 *   to Y-axis rotation in 3D mode.
 */

const AVATAR_RADIUS = config.avatar.size / 2;
const MOVE_SPEED = config.avatar.speed;
const ROOM_LABEL_FONT = '13px sans-serif';

// Room type → display emoji
const ROOM_ICONS = {
  lobby: '🏛️',
  office: '💼',
  meeting: '🤝',
  lounge: '☕',
  'ai-hub': '🤖',
};

export default function WorldCanvas({
  world,
  avatars,
  myUserId,
  nearbyIds,
  onMove,
  onIdle,
}) {
  const canvasRef = useRef(null);
  const keysRef = useRef(new Set());
  const myPosRef = useRef(null);       // { x, y } — driven by server state
  const animRef = useRef(null);
  const movingRef = useRef(false);
  const cameraRef = useRef({ x: 0, y: 0 }); // top-left of viewport in world units

  // ── Sync local position from server state ──────────────────────────────────
  useEffect(() => {
    const me = avatars.find((a) => a.id === myUserId);
    if (me && !myPosRef.current) {
      myPosRef.current = { x: me.x, y: me.y };
    }
  }, [avatars, myUserId]);

  // ── Keyboard input ─────────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e) {
      const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'];
      if (keys.includes(e.key)) {
        e.preventDefault();
        keysRef.current.add(e.key);
      }
    }
    function onKeyUp(e) {
      keysRef.current.delete(e.key);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // ── Game loop ──────────────────────────────────────────────────────────────
  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !world || !myPosRef.current) {
      animRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    const keys = keysRef.current;
    let { x, y } = myPosRef.current;
    let moved = false;
    let direction = 'down';

    if (keys.has('ArrowUp') || keys.has('w')) { y -= MOVE_SPEED; direction = 'up'; moved = true; }
    if (keys.has('ArrowDown') || keys.has('s')) { y += MOVE_SPEED; direction = 'down'; moved = true; }
    if (keys.has('ArrowLeft') || keys.has('a')) { x -= MOVE_SPEED; direction = 'left'; moved = true; }
    if (keys.has('ArrowRight') || keys.has('d')) { x += MOVE_SPEED; direction = 'right'; moved = true; }

    // Clamp to world bounds
    x = Math.max(AVATAR_RADIUS, Math.min(world.bounds.width - AVATAR_RADIUS, x));
    y = Math.max(AVATAR_RADIUS, Math.min(world.bounds.height - AVATAR_RADIUS, y));

    if (moved) {
      myPosRef.current = { x, y };
      onMove(x, y, direction);
      movingRef.current = true;
    } else if (movingRef.current) {
      movingRef.current = false;
      onIdle();
    }

    // Camera: keep my avatar centred
    const vw = canvas.width;
    const vh = canvas.height;
    cameraRef.current = {
      x: Math.max(0, Math.min(world.bounds.width - vw, x - vw / 2)),
      y: Math.max(0, Math.min(world.bounds.height - vh, y - vh / 2)),
    };

    render(canvas, world, avatars, myUserId, nearbyIds, cameraRef.current);
    animRef.current = requestAnimationFrame(gameLoop);
  }, [world, avatars, myUserId, nearbyIds, onMove, onIdle]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animRef.current);
  }, [gameLoop]);

  // ── Canvas resize ──────────────────────────────────────────────────────────
  useEffect(() => {
    function resize() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const container = canvas.parentElement;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={styles.canvas}
      tabIndex={0}
      aria-label="Virtual workspace — use arrow keys or WASD to move"
    />
  );
}

// ── Renderer ─────────────────────────────────────────────────────────────────

function render(canvas, world, avatars, myUserId, nearbyIds, camera) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  // Background
  ctx.fillStyle = '#2c2c3e';
  ctx.fillRect(0, 0, world.bounds.width, world.bounds.height);

  // Rooms
  for (const room of world.rooms) {
    drawRoom(ctx, room);
  }

  // Proximity circle around my avatar
  const me = avatars.find((a) => a.id === myUserId);
  if (me) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(me.x, me.y, config.world.proximityRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(52, 152, 219, 0.2)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Avatars
  for (const avatar of avatars) {
    const isMe = avatar.id === myUserId;
    const isNearby = nearbyIds.includes(avatar.id);
    drawAvatar(ctx, avatar, isMe, isNearby);
  }

  ctx.restore();
}

function drawRoom(ctx, room) {
  const { bounds, color, name, type } = room;

  // Room fill
  ctx.fillStyle = color || '#f5f5f5';
  ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);

  // Room border
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 2;
  ctx.strokeRect(bounds.x + 1, bounds.y + 1, bounds.width - 2, bounds.height - 2);

  // Room label
  const icon = ROOM_ICONS[type] || '📍';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.font = `bold ${ROOM_LABEL_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(
    `${icon} ${name}`,
    bounds.x + bounds.width / 2,
    bounds.y + 22
  );
}

function drawAvatar(ctx, avatar, isMe, isNearby) {
  const { x, y, username, avatarColor, state, isAI } = avatar;
  const r = AVATAR_RADIUS;

  // Glow for nearby / self
  if (isNearby || isMe) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = isMe ? 'rgba(52,152,219,0.35)' : 'rgba(255,255,255,0.2)';
    ctx.fill();
    ctx.restore();
  }

  // Avatar body
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = avatarColor || '#3498db';
  ctx.fill();

  // Border
  ctx.strokeStyle = isMe ? '#fff' : 'rgba(255,255,255,0.5)';
  ctx.lineWidth = isMe ? 3 : 1.5;
  ctx.stroke();

  // State indicator (walking = subtle pulse dot)
  if (state === 'walking') {
    ctx.beginPath();
    ctx.arc(x + r * 0.6, y - r * 0.6, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#2ecc71';
    ctx.fill();
  } else if (state === 'busy') {
    ctx.beginPath();
    ctx.arc(x + r * 0.6, y - r * 0.6, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#e74c3c';
    ctx.fill();
  }

  // AI badge
  if (isAI) {
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText('🤖', x, y + 4);
  } else {
    // Initials
    const initials = (username || '?').charAt(0).toUpperCase();
    ctx.font = `bold ${r}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(initials, x, y);
    ctx.textBaseline = 'alphabetic';
  }

  // Name label below avatar
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = isMe ? '#fff' : 'rgba(255,255,255,0.8)';
  ctx.fillText(username || 'Unknown', x, y + r + 14);
}

const styles = {
  canvas: {
    flex: 1,
    display: 'block',
    cursor: 'crosshair',
    outline: 'none',
  },
};
