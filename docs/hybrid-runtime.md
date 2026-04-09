# Hybrid Runtime Deployment Strategy

## Modes

- `node`: Node backend handles REST + realtime (default dev mode).
- `hybrid`: Node handles REST/auth/integration, Rust handles realtime execution.
- `rust`: Production-oriented mode with Rust as primary realtime runtime.

## Routing

- REST (`/api/*`) -> Node backend
- Realtime socket path -> Rust service (`ws://.../ws`) when client runtime mode is `rust` or `auto` with `REALTIME_URL` set.

## Orchestration bridge

Node forwards AI control messages to Rust bridge endpoints:

- `POST /bridge/spawn-agent`
- `POST /bridge/despawn-agent`
- `POST /bridge/command`
- `POST /bridge/message`

Use `REALTIME_BRIDGE_KEY` / `x-bridge-key` for bridge authentication.

## Rollout

1. Dev: `node` mode (existing flow).
2. Staging: `hybrid` mode and mirror realtime traffic for parity checks.
3. Production: client runtime switch to `rust`.
4. Fallback: switch `VITE_RUNTIME_MODE` / `NEXT_PUBLIC_RUNTIME_MODE` to `node`.
