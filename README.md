# 🏠 House – Virtual Workspace

A **real-time multi-user virtual workspace** with embodied presence (avatars), spatial interaction, and external system integration (including AI agents).

Users exist as avatars inside a digital building, move freely through rooms, and communicate based on proximity — all in a browser. The architecture is designed to upgrade seamlessly to a full 3D / Unity immersive experience.

---

## ✨ Features

| Feature | Status |
|---|---|
| 🔐 User authentication (JWT) | ✅ |
| 🧍 Avatar movement (WASD / arrow keys) | ✅ |
| 📡 Real-time position sync (WebSocket) | ✅ |
| 🏢 Multi-room building (lobby, offices, meeting rooms, lounge, AI hub) | ✅ |
| 💬 Room-based chat | ✅ |
| 📡 Proximity chat (talk to nearby avatars only) | ✅ |
| 🌐 Global broadcast chat | ✅ |
| 🤖 AI agent API (spawn agents, send commands, inject messages) | ✅ |
| 🏛️ Spatial proximity detection | ✅ |
| 🎯 3D-ready coordinate system (x, y, z) | ✅ |

---

## 🗂️ Project Structure

```
House/
├── backend/              # Node.js + Express + Socket.io server
│   └── src/
│       ├── server.js           # Entry point
│       ├── config.js           # Centralised configuration
│       ├── auth/               # JWT authentication
│       ├── world/              # World engine (rooms, spatial logic)
│       ├── avatar/             # Avatar manager (position, state)
│       ├── communication/      # Chat manager (messages, history)
│       ├── integration/        # AI agent REST API
│       └── socket/             # Socket.io real-time handlers
│
└── frontend/             # React + HTML5 Canvas web app
    └── src/
        ├── App.jsx             # Root component (auth gate)
        ├── config.js           # Frontend config
        ├── services/
        │   ├── auth.js         # Auth API + localStorage session
        │   └── socket.js       # Socket.io client wrapper
        └── components/
            ├── Auth/           # Login & Register forms
            ├── World/          # Canvas renderer + WorldView
            ├── Chat/           # Chat panel
            └── HUD/            # Heads-up display (top bar)
```

---

## 🚀 Quick Start

### Prerequisites

* Node.js ≥ 18

### 1 — Install dependencies

```bash
# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 2 — Start the backend

```bash
cd backend
npm run dev        # hot-reloads with --watch
# or
npm start
```

The server runs on **http://localhost:4000**.

### 3 — Start the frontend

```bash
cd frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

### 4 — Register an account and enter the world!

* Use WASD or arrow keys to move your avatar.
* Walk into rooms to join their chat channel.
* Switch between Room / Nearby / Global chat modes in the top bar.

---

## 🌐 Architecture

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, HTML5 Canvas, Vite |
| Backend | Node.js, Express 4, Socket.io 4 |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Real-time | WebSocket via Socket.io |
| Storage | In-memory (swap for MongoDB/Postgres) |

### Coordinate System

All positions use **(x, y, z)** world units:

* **2D mode (current):** z = 0, rendered on HTML5 Canvas.
* **3D mode (future):** z = elevation; the same socket protocol and world engine are reused. Only the renderer changes (Three.js, Babylon.js, or Unity WebGL).

### World Layout (default building)

```
┌──────────────────────────────────────────────────────┐  y=0
│                    Main Lobby (1200×200)              │
├─────────────────────────┬──────────────┬─────────────┤  y=200
│   Open Office (600×300) │ Meeting A    │ Meeting B   │
│                         │  (300×300)   │  (300×300)  │
├─────────────────┬───────┴──────────────┴─────────────┤  y=500
│ Lounge (400×300)│         AI Hub (800×300)            │
└─────────────────┴─────────────────────────────────────┘  y=800
x=0                                                    x=1200
```

---

## 🤖 AI Agent Integration

External AI systems connect via a REST API using an agent key.

### Authentication

All AI endpoints require the header:

```
X-Agent-Key: house-ai-dev-key
```

Change the key via the `AI_AGENT_KEY` environment variable in production.

### Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/ai/spawn-agent` | Spawn an AI-controlled avatar |
| `DELETE` | `/api/ai/despawn-agent/:id` | Remove an AI avatar |
| `POST` | `/api/ai/command` | Send a command to any avatar |
| `POST` | `/api/ai/message` | Inject a chat message as an avatar |
| `GET` | `/api/ai/world-state` | Snapshot of all avatars + rooms |

### Example: Spawn and command an AI agent

```bash
# Spawn
curl -X POST http://localhost:4000/api/ai/spawn-agent \
  -H 'Content-Type: application/json' \
  -H 'X-Agent-Key: house-ai-dev-key' \
  -d '{"userId":"aria-ai","username":"Aria (AI)","avatarColor":"#9b59b6"}'

# Move to AI Hub
curl -X POST http://localhost:4000/api/ai/command \
  -H 'Content-Type: application/json' \
  -H 'X-Agent-Key: house-ai-dev-key' \
  -d '{"userId":"aria-ai","command":{"type":"TELEPORT","payload":{"roomId":"ai-hub"}}}'

# Send a message
curl -X POST http://localhost:4000/api/ai/message \
  -H 'Content-Type: application/json' \
  -H 'X-Agent-Key: house-ai-dev-key' \
  -d '{"userId":"aria-ai","content":"Hello, I am your AI assistant!"}'
```

### Command Types

| Type | Payload | Effect |
|---|---|---|
| `MOVE` | `{ x, y, z? }` | Move avatar to coordinates |
| `TELEPORT` | `{ roomId }` | Instantly jump to a room's spawn point |
| `SET_STATE` | `{ state: 'idle'\|'busy'\|'walking' }` | Change avatar status |

---

## ⚙️ Environment Variables

### Backend

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | HTTP server port |
| `JWT_SECRET` | `house-dev-secret-change-in-production` | JWT signing secret |
| `JWT_EXPIRES_IN` | `24h` | Token expiry |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed frontend origin |
| `AI_AGENT_KEY` | `house-ai-dev-key` | Secret key for AI API |

### Frontend

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `` (empty, proxied) | Backend API base URL |
| `VITE_SOCKET_URL` | `` (empty, proxied) | Socket.io server URL |

---

## 🧪 Tests

```bash
cd backend && npm test
```

28 tests covering:
* World Engine (rooms, position, proximity)
* Avatar Manager (spawn, move, commands)
* Chat Manager (messages, history)
* Auth API (register, login, JWT validation)

---

## 🔮 Roadmap

- [ ] Persistent storage (MongoDB / Postgres)
- [ ] Voice chat (proximity-based via WebRTC)
- [ ] Video feeds on avatars
- [ ] Custom avatar appearance (colours, shapes)
- [ ] 3D renderer upgrade (Three.js / Babylon.js)
- [ ] Unity WebGL client
- [ ] Admin dashboard (room management, user control)
- [ ] Monetisation layer (paid rooms, subscriptions)
- [ ] Business integrations (calendar, task tools)

---

## 📡 Socket.io Event Reference

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `avatar:move` | `{ x, y, z?, direction? }` | Move avatar |
| `avatar:idle` | — | Stop moving |
| `chat:send` | `{ content, type?, recipientId? }` | Send message |
| `room:history` | `{ roomId }` | Request room chat history |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `world:init` | `{ world, avatars, myUserId }` | Full world state on connect |
| `avatar:joined` | Avatar object | New avatar entered |
| `avatar:update` | Avatar object | Position/state changed |
| `avatar:left` | `{ userId }` | Avatar disconnected |
| `chat:message` | Message object | New chat message |
| `chat:history` | `{ roomId, messages }` | Historical messages |
| `proximity:update` | `{ nearby: string[] }` | Nearby avatar IDs changed |

