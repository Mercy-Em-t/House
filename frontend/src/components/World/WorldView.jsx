import React, { useEffect, useRef, useState, useCallback } from 'react';
import { connect, disconnect, emitMove, emitIdle, emitChat, requestHistory } from '../../services/socket';
import { getToken } from '../../services/auth';
import WorldCanvas from './WorldCanvas.jsx';
import ChatPanel from '../Chat/ChatPanel.jsx';
import HUD from '../HUD/HUD.jsx';

/**
 * WorldView
 *
 * Top-level component for the in-world experience.
 * Manages:
 *  – Socket connection lifecycle
 *  – Shared world state (avatars, current room, nearby users)
 *  – Passes actions down to WorldCanvas and ChatPanel
 */
export default function WorldView({ user, onLogout }) {
  const [connected, setConnected] = useState(false);
  const [world, setWorld] = useState(null);      // { bounds, rooms }
  const [avatars, setAvatars] = useState({});     // userId → avatar
  const [messages, setMessages] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [nearbyIds, setNearbyIds] = useState([]);
  const [chatMode, setChatMode] = useState('room'); // 'room' | 'global' | 'proximity'
  const socketRef = useRef(null);
  const myIdRef = useRef(user.id);

  const addMessage = useCallback((msg) => {
    setMessages((prev) => {
      // Avoid duplicates
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev.slice(-199), msg];
    });
  }, []);

  useEffect(() => {
    const socket = connect();
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('world:init', ({ world, avatars: initialAvatars, myUserId }) => {
      myIdRef.current = myUserId;
      setWorld(world);
      const map = {};
      for (const a of initialAvatars) map[a.id] = a;
      setAvatars(map);

      // Set initial room
      const me = map[myUserId];
      if (me) {
        const room = world.rooms.find((r) => r.id === me.roomId);
        setCurrentRoom(room || null);
      }
    });

    socket.on('avatar:joined', (avatar) => {
      setAvatars((prev) => ({ ...prev, [avatar.id]: avatar }));
    });

    socket.on('avatar:update', (avatar) => {
      setAvatars((prev) => {
        const updated = { ...prev, [avatar.id]: avatar };
        // Update current room if it's my avatar
        if (avatar.id === myIdRef.current) {
          // Use functional update so we don't capture 'world' in closure
          setWorld((currentWorld) => {
            if (currentWorld) {
              const room = currentWorld.rooms.find((r) => r.id === avatar.roomId);
              setCurrentRoom(room || null);
            }
            return currentWorld;
          });
        }
        return updated;
      });
    });

    socket.on('avatar:left', ({ userId }) => {
      setAvatars((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    });

    socket.on('chat:message', addMessage);
    socket.on('chat:history', ({ messages: msgs }) => {
      msgs.forEach(addMessage);
    });

    socket.on('proximity:update', ({ nearby }) => {
      setNearbyIds(nearby);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('world:init');
      socket.off('avatar:joined');
      socket.off('avatar:update');
      socket.off('avatar:left');
      socket.off('chat:message');
      socket.off('chat:history');
      socket.off('proximity:update');
    };
  }, [addMessage]);

  // Fetch room history when entering a new room
  const currentRoomId = currentRoom?.id ?? null;
  useEffect(() => {
    if (currentRoomId) {
      requestHistory(currentRoomId);
    }
  }, [currentRoomId]);

  function handleAvatarMove(x, y, direction) {
    emitMove(x, y, 0, direction);
  }

  function handleAvatarIdle() {
    emitIdle();
  }

  function handleSendMessage(content) {
    if (!content.trim()) return;
    emitChat(content.trim(), chatMode);
  }

  function handleLogout() {
    disconnect();
    onLogout();
  }

  if (!connected || !world) {
    return (
      <div style={styles.connecting}>
        <div style={styles.spinner} />
        <p>Connecting to House…</p>
        {!connected && (
          <p style={styles.hint}>Make sure the backend server is running on port 4000.</p>
        )}
      </div>
    );
  }

  const myAvatar = avatars[myIdRef.current];

  return (
    <div style={styles.container}>
      <HUD
        user={user}
        currentRoom={currentRoom}
        onlineCount={Object.keys(avatars).length}
        nearbyCount={nearbyIds.length}
        chatMode={chatMode}
        onChatModeChange={setChatMode}
        onLogout={handleLogout}
        connected={connected}
      />

      <div style={styles.main}>
        <WorldCanvas
          world={world}
          avatars={Object.values(avatars)}
          myUserId={myIdRef.current}
          nearbyIds={nearbyIds}
          onMove={handleAvatarMove}
          onIdle={handleAvatarIdle}
        />

        <ChatPanel
          messages={messages}
          myUserId={myIdRef.current}
          currentRoom={currentRoom}
          chatMode={chatMode}
          onSend={handleSendMessage}
        />
      </div>

      {/* Room entry notification */}
      {currentRoom && (
        <div style={styles.roomBadge}>
          📍 {currentRoom.name}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
    background: '#1a1a2e',
  },
  main: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  connecting: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    gap: 16,
    background: '#1a1a2e',
    color: '#fff',
  },
  hint: {
    fontSize: 13,
    color: '#888',
    maxWidth: 300,
    textAlign: 'center',
  },
  spinner: {
    width: 40,
    height: 40,
    border: '4px solid rgba(255,255,255,0.2)',
    borderTopColor: '#3498db',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  roomBadge: {
    position: 'fixed',
    bottom: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.7)',
    color: '#fff',
    padding: '6px 16px',
    borderRadius: 20,
    fontSize: 13,
    pointerEvents: 'none',
    backdropFilter: 'blur(4px)',
  },
};
