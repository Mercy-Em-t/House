# State Consistency Test (QCT)

Target:
- Position divergence < 5 pixels
- No ghost avatars
- No desync/rubber-banding

Method:
1. Connect at least 3 clients.
2. Move one avatar across multiple rooms.
3. Capture positions from each client view and server snapshot stream.
4. Compare per-tick position deltas.

Pass criteria:
- All clients remain within ±5px for tracked avatar position.
- No stale avatars remain after disconnect.
