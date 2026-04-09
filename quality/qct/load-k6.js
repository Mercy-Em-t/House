import ws from 'k6/ws';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.VUS || 50),
  duration: __ENV.DURATION || '60s',
};

const BASE = __ENV.REALTIME_WS_URL || 'ws://localhost:4100/ws';

function randomDirection() {
  const angle = Math.random() * Math.PI * 2;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

export default function () {
  const userId = `bot-${__VU}-${Date.now()}`;
  const res = ws.connect(BASE, {}, (socket) => {
    socket.on('open', () => {
      socket.send(
        JSON.stringify({
          event: 'avatar:intent',
          data: {
            userId,
            mode: 'steer',
            active: true,
            direction: randomDirection(),
            speed: 220,
            clientTime: Date.now(),
          },
        })
      );
    });

    socket.on('message', () => {});

    socket.setInterval(() => {
      socket.send(
        JSON.stringify({
          event: 'avatar:intent',
          data: {
            userId,
            mode: 'steer',
            active: true,
            direction: randomDirection(),
            speed: 220,
            clientTime: Date.now(),
          },
        })
      );
    }, 250);

    socket.setTimeout(() => {
      socket.close();
    }, 5000);
  });

  check(res, {
    'ws upgraded': (r) => r && r.status === 101,
  });
  sleep(1);
}
