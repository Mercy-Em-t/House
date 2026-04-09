import React, { useRef, useEffect, useCallback, useState } from 'react';
import config from '../../config.js';

const ROOM_LABEL_FONT = '13px sans-serif';
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
  onIntent,
  onIdle,
  movementProfile,
  characterProfile,
}) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const keysRef = useRef(new Set());
  const steerActiveRef = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0, panning: false, lastX: 0, lastY: 0 });
  const cameraRef = useRef({ x: 0, y: 0 });
  const renderAvatarsRef = useRef({});
  const seqRef = useRef(0);
  const [controlMode, setControlMode] = useState(movementProfile?.controller || 'steer'); // steer | tap | grid
  const [cameraMode, setCameraMode] = useState('lookAhead'); // center | lookAhead
  const [freeLook, setFreeLook] = useState(false);

  useEffect(() => {
    if (movementProfile?.controller) {
      setControlMode(movementProfile.controller);
    }
  }, [movementProfile?.controller]);

  const emitIntent = useCallback((intent) => {
    const speedMultiplier = Number.isFinite(Number(movementProfile?.speedMultiplier))
      ? Number(movementProfile.speedMultiplier)
      : 1;
    onIntent({
      sequence: ++seqRef.current,
      clientTime: Date.now(),
      speed: config.avatar.speed * 55 * speedMultiplier,
      ...intent,
    });
  }, [movementProfile?.speedMultiplier, onIntent]);

  const getMyAvatar = useCallback(() => avatars.find((a) => a.id === myUserId) || null, [avatars, myUserId]);

  const getWorldPointer = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left + cameraRef.current.x,
      y: event.clientY - rect.top + cameraRef.current.y,
    };
  }, []);

  const sendSteerIntent = useCallback((target) => {
    const me = getMyAvatar();
    if (!me) return;
    const dx = target.x - me.x;
    const dy = target.y - me.y;
    const mag = Math.hypot(dx, dy) || 1;
    emitIntent({
      mode: 'steer',
      active: true,
      direction: { x: dx / mag, y: dy / mag },
    });
  }, [emitIntent, getMyAvatar]);

  useEffect(() => {
    function onKeyDown(e) {
      const key = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
        e.preventDefault();
        keysRef.current.add(key);
      }
      if (key === '1') setControlMode('steer');
      if (key === '2') setControlMode('tap');
      if (key === '3') setControlMode('grid');
      if (key === 'c') setCameraMode('center');
      if (key === 'l') setCameraMode('lookAhead');
      if (key === 'f') setFreeLook((v) => !v);
    }
    function onKeyUp(e) {
      keysRef.current.delete(e.key.toLowerCase());
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const onPointerDown = useCallback((event) => {
    const point = getWorldPointer(event);
    pointerRef.current.x = point.x;
    pointerRef.current.y = point.y;
    pointerRef.current.lastX = event.clientX;
    pointerRef.current.lastY = event.clientY;

    if (freeLook && event.button !== 0) {
      pointerRef.current.panning = true;
      return;
    }

    if (controlMode === 'steer') {
      steerActiveRef.current = true;
      sendSteerIntent(point);
      return;
    }

    const me = getMyAvatar();
    if (!me) return;
    const dx = point.x - me.x;
    const dy = point.y - me.y;
    const mag = Math.hypot(dx, dy) || 1;

    if (controlMode === 'tap') {
      emitIntent({
        mode: 'tap',
        active: true,
        direction: { x: dx / mag, y: dy / mag },
        target: point,
      });
      return;
    }

    if (controlMode === 'grid') {
      const axis = Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
      emitIntent({
        mode: 'grid',
        active: true,
        direction: axis,
      });
    }
  }, [controlMode, emitIntent, freeLook, getMyAvatar, getWorldPointer, sendSteerIntent]);

  const onPointerMove = useCallback((event) => {
    const point = getWorldPointer(event);
    pointerRef.current.x = point.x;
    pointerRef.current.y = point.y;

    if (pointerRef.current.panning) {
      const dx = event.clientX - pointerRef.current.lastX;
      const dy = event.clientY - pointerRef.current.lastY;
      pointerRef.current.lastX = event.clientX;
      pointerRef.current.lastY = event.clientY;
      cameraRef.current.x = clamp(cameraRef.current.x - dx, 0, world.bounds.width - canvasRef.current.width);
      cameraRef.current.y = clamp(cameraRef.current.y - dy, 0, world.bounds.height - canvasRef.current.height);
      return;
    }

    if (steerActiveRef.current && controlMode === 'steer') {
      sendSteerIntent(point);
    }
  }, [controlMode, getWorldPointer, sendSteerIntent, world.bounds.height, world.bounds.width]);

  const onPointerUp = useCallback(() => {
    pointerRef.current.panning = false;
    if (!steerActiveRef.current) return;
    steerActiveRef.current = false;
    emitIntent({ mode: 'steer', active: false });
    onIdle();
  }, [emitIntent, onIdle]);

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const me = getMyAvatar();
    if (!canvas || !world || !me) {
      animRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    // keyboard directional steering for simulation/testing
    const keys = keysRef.current;
    const dir = {
      x: (keys.has('arrowright') || keys.has('d') ? 1 : 0) + (keys.has('arrowleft') || keys.has('a') ? -1 : 0),
      y: (keys.has('arrowdown') || keys.has('s') ? 1 : 0) + (keys.has('arrowup') || keys.has('w') ? -1 : 0),
    };
    if (controlMode === 'steer') {
      if (dir.x || dir.y) {
        const mag = Math.hypot(dir.x, dir.y);
        emitIntent({ mode: 'steer', active: true, direction: { x: dir.x / mag, y: dir.y / mag } });
      } else if (!steerActiveRef.current) {
        emitIntent({ mode: 'steer', active: false });
      }
    }

    // smooth camera follow with optional look-ahead offset
    if (!pointerRef.current.panning) {
      const look = cameraMode === 'lookAhead' ? 32 : 0;
      const lookX = me.direction === 'right' ? look : me.direction === 'left' ? -look : 0;
      const lookY = me.direction === 'down' ? look : me.direction === 'up' ? -look : 0;
      const targetX = clamp(me.x - canvas.width / 2 + lookX, 0, world.bounds.width - canvas.width);
      const targetY = clamp(me.y - canvas.height / 2 + lookY, 0, world.bounds.height - canvas.height);
      if (!freeLook) {
        cameraRef.current.x = lerp(cameraRef.current.x, targetX, 0.16);
        cameraRef.current.y = lerp(cameraRef.current.y, targetY, 0.16);
      }
    }

    // client interpolation for smooth snapshots
    const nextRenderAvatars = { ...renderAvatarsRef.current };
    for (const avatar of avatars) {
      const cur = nextRenderAvatars[avatar.id] || { ...avatar };
      cur.x = lerp(cur.x, avatar.x, 0.25);
      cur.y = lerp(cur.y, avatar.y, 0.25);
      cur.direction = avatar.direction;
      cur.state = avatar.state;
      cur.username = avatar.username;
      cur.avatarColor = avatar.avatarColor;
      cur.isAI = avatar.isAI;
      nextRenderAvatars[avatar.id] = cur;
    }
    renderAvatarsRef.current = nextRenderAvatars;

    render(canvas, world, Object.values(renderAvatarsRef.current), myUserId, nearbyIds, cameraRef.current, characterProfile);

    animRef.current = requestAnimationFrame(gameLoop);
  }, [avatars, cameraMode, characterProfile, controlMode, emitIntent, freeLook, getMyAvatar, myUserId, nearbyIds, world]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animRef.current);
  }, [gameLoop]);

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
      aria-label="Virtual workspace — drag to steer, T tap mode, G grid mode"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

function render(canvas, world, avatars, myUserId, nearbyIds, camera, characterProfile) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  ctx.fillStyle = '#2c2c3e';
  ctx.fillRect(0, 0, world.bounds.width, world.bounds.height);

  for (const room of world.rooms) drawRoom(ctx, room);

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

  for (const avatar of avatars) {
    drawAvatar(ctx, avatar, avatar.id === myUserId, nearbyIds.includes(avatar.id), characterProfile);
  }
  ctx.restore();
}

function drawRoom(ctx, room) {
  const { bounds, color, name, type } = room;
  ctx.fillStyle = color || '#f5f5f5';
  ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 2;
  ctx.strokeRect(bounds.x + 1, bounds.y + 1, bounds.width - 2, bounds.height - 2);
  const icon = ROOM_ICONS[type] || '📍';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.font = `bold ${ROOM_LABEL_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(`${icon} ${name}`, bounds.x + bounds.width / 2, bounds.y + 22);
}

function drawAvatar(ctx, avatar, isMe, isNearby, characterProfile) {
  const { x, y, username, avatarColor, state, isAI } = avatar;
  const size = Number.isFinite(Number(characterProfile?.size))
    ? Number(characterProfile.size)
    : config.avatar.size;
  const r = size / 2;
  const shape = characterProfile?.shape === 'block' ? 'block' : 'circle';
  if (isNearby || isMe) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = isMe ? 'rgba(52,152,219,0.35)' : 'rgba(255,255,255,0.2)';
    ctx.fill();
    ctx.restore();
  }

  ctx.beginPath();
  if (shape === 'block') {
    ctx.rect(x - r, y - r, size, size);
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fillStyle = avatarColor || '#3498db';
  ctx.fill();
  ctx.strokeStyle = isMe ? '#fff' : 'rgba(255,255,255,0.5)';
  ctx.lineWidth = isMe ? 3 : 1.5;
  ctx.stroke();

  if (state === 'moving') {
    drawStateDot(ctx, x, y, r, '#2ecc71');
  } else if (state === 'speaking') {
    drawStateDot(ctx, x, y, r, '#f39c12');
  } else if (state === 'interacting') {
    drawStateDot(ctx, x, y, r, '#9b59b6');
  }

  if (isAI) {
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText('🤖', x, y + 4);
  } else {
    const initials = (username || '?').charAt(0).toUpperCase();
    ctx.font = `bold ${r}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(initials, x, y);
    ctx.textBaseline = 'alphabetic';
  }

  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = isMe ? '#fff' : 'rgba(255,255,255,0.8)';
  ctx.fillText(username || 'Unknown', x, y + r + 14);
}

function drawStateDot(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x + r * 0.6, y - r * 0.6, 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

const styles = {
  canvas: {
    flex: 1,
    display: 'block',
    cursor: 'crosshair',
    outline: 'none',
    touchAction: 'none',
  },
};
