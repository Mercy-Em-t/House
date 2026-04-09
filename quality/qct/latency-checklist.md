# Real-Time Latency Test (QCT)

Target:
- Movement delay <= 100ms
- Chat delay <= 200ms
- Tick rate 20-30 FPS

Method:
1. Connect Client A and Client B.
2. Move avatar on Client A.
3. Measure timestamp delta when Client B receives update.
4. Repeat with throttled network profiles.

Pass criteria:
- Smooth movement with no teleporting/jumping.
- 95th percentile movement propagation <= 100ms.
