/**
 * House Frontend Configuration
 * Reads environment variables injected by Vite at build time.
 */
function readEnv(name) {
  if (typeof import.meta !== 'undefined' && import.meta.env && name in import.meta.env) {
    return import.meta.env[name];
  }
  if (typeof process !== 'undefined' && process.env && name in process.env) {
    return process.env[name];
  }
  return undefined;
}

function firstEnv(...names) {
  for (const name of names) {
    const value = readEnv(name);
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

const runtimeMode = (firstEnv('VITE_RUNTIME_MODE', 'NEXT_PUBLIC_RUNTIME_MODE') || 'node').toLowerCase();
const apiBase = firstEnv('VITE_API_URL', 'NEXT_PUBLIC_API_URL');
const nodeSocket = firstEnv('VITE_SOCKET_URL', 'NEXT_PUBLIC_SOCKET_URL');
const realtimeSocket = firstEnv('VITE_REALTIME_URL', 'NEXT_PUBLIC_REALTIME_URL');

function resolveSocketUrl() {
  if (runtimeMode === 'rust') return realtimeSocket || nodeSocket || '';
  if (runtimeMode === 'auto') return realtimeSocket || nodeSocket || '';
  return nodeSocket || realtimeSocket || '';
}

const config = {
  runtime: {
    mode: runtimeMode,
  },
  apiBase,
  socketUrl: resolveSocketUrl(),
  world: {
    tileSize: 40, // pixels per world unit in 2D mode
    proximityRadius: 120,
  },
  avatar: {
    size: 36, // avatar circle diameter in pixels
    speed: 4, // pixels per key-press tick
  },
};

export default config;
