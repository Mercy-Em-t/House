/**
 * House Frontend Configuration
 * Reads environment variables injected by Vite at build time.
 */
const config = {
  apiBase: import.meta.env.VITE_API_URL || '',
  socketUrl: import.meta.env.VITE_SOCKET_URL || '',
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
