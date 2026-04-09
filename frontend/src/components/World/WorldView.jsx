import React, { useEffect, useRef, useState, useCallback } from 'react';
import { connect, disconnect, emitIntent, emitIdle, emitChat, requestHistory, emitJoinRoom } from '../../services/socket';
import WorldCanvas from './WorldCanvas.jsx';
import ChatPanel from '../Chat/ChatPanel.jsx';
import HUD from '../HUD/HUD.jsx';
import ControlPanel from '../Settings/ControlPanel.jsx';
import {
  createPaymentIntent,
  fetchAISubscription,
  fetchLedger,
  fetchRoomPolicy,
  fetchWallet,
  rentRoom,
  subscribeAI,
} from '../../services/monetization';

const CONTROL_CONFIG_STORAGE_KEY = 'house_control_config_v1';
const DEFAULT_CONTROL_CONFIG = {
  movementTypes: [
    { id: 'continuous', label: 'Continuous Directional', controller: 'steer', speedMultiplier: 1 },
    { id: 'tap-test', label: 'Tap to Move', controller: 'tap', speedMultiplier: 1 },
    { id: 'grid-debug', label: 'Grid Step', controller: 'grid', speedMultiplier: 1 },
  ],
  characterTypes: [
    { id: 'circle-default', label: 'Circle', shape: 'circle', size: 36 },
    { id: 'block-default', label: 'Block', shape: 'block', size: 34 },
  ],
  activeMovementType: 'continuous',
  activeCharacterType: 'circle-default',
};

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
  const [controlPanelOpen, setControlPanelOpen] = useState(false);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [aiSubscription, setAISubscription] = useState({ active: false, subscription: null });
  const [rentalCountdown, setRentalCountdown] = useState(0);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [blockedReason, setBlockedReason] = useState('');
  const [controlConfig, setControlConfig] = useState(() => {
    try {
      const raw = localStorage.getItem(CONTROL_CONFIG_STORAGE_KEY);
      if (!raw) return DEFAULT_CONTROL_CONFIG;
      return sanitizeControlConfig(JSON.parse(raw));
    } catch {
      return DEFAULT_CONTROL_CONFIG;
    }
  });
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

    socket.on('world:snapshot', ({ avatars: snapshotAvatars }) => {
      if (!Array.isArray(snapshotAvatars)) return;
      setAvatars((prev) => {
        const next = { ...prev };
        for (const avatar of snapshotAvatars) {
          next[avatar.id] = avatar;
          if (avatar.id === myIdRef.current) {
            setWorld((currentWorld) => {
              if (currentWorld) {
                const room = currentWorld.rooms.find((r) => r.id === avatar.roomId);
                setCurrentRoom(room || null);
              }
              return currentWorld;
            });
          }
        }
        return next;
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

    socket.on('room:join-denied', ({ message }) => {
      setBlockedReason(message || 'Room access denied');
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('world:init');
      socket.off('avatar:joined');
      socket.off('avatar:update');
      socket.off('world:snapshot');
      socket.off('avatar:left');
      socket.off('chat:message');
      socket.off('chat:history');
      socket.off('proximity:update');
      socket.off('room:join-denied');
    };
  }, [addMessage]);

  const refreshMonetization = useCallback(async () => {
    try {
      const [walletData, aiData, ledgerData] = await Promise.all([
        fetchWallet(),
        fetchAISubscription(),
        fetchLedger(8),
      ]);
      setTokenBalance(walletData?.wallet?.tokenBalance || 0);
      setAISubscription(aiData || { active: false, subscription: null });
      setRecentTransactions(ledgerData?.entries || []);
    } catch (error) {
      setBlockedReason(error.message);
    }
  }, []);

  useEffect(() => {
    refreshMonetization();
  }, [refreshMonetization]);

  // Fetch room history when entering a new room
  const currentRoomId = currentRoom?.id ?? null;
  useEffect(() => {
    if (currentRoomId) {
      requestHistory(currentRoomId);
      fetchRoomPolicy(currentRoomId)
        .then((policy) => {
          const seconds = policy?.rentalStatus?.remainingSeconds || 0;
          setRentalCountdown(seconds);
        })
        .catch(() => {});
    }
  }, [currentRoomId]);

  useEffect(() => {
    if (!currentRoomId) {
      setRentalCountdown(0);
      return undefined;
    }
    const timer = setInterval(() => {
      setRentalCountdown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [currentRoomId]);

  function handleAvatarIntent(intent) {
    emitIntent(intent);
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

  function handleJoinRoom() {
    setBlockedReason('');
    if (currentRoom?.id) emitJoinRoom(currentRoom.id);
  }

  async function handleBuy(provider) {
    try {
      const result = await createPaymentIntent(provider, 100);
      setBlockedReason(`Payment intent created via ${provider}. Complete provider checkout and webhook settlement.`);
      setRecentTransactions((prev) => [result.intent, ...prev].slice(0, 8));
      await refreshMonetization();
    } catch (error) {
      setBlockedReason(error.message);
    }
  }

  async function handleSubscribeAI() {
    try {
      await subscribeAI();
      setBlockedReason('');
      await refreshMonetization();
    } catch (error) {
      setBlockedReason(error.message);
    }
  }

  async function handleRentRoom() {
    if (!currentRoom?.id) return;
    try {
      const result = await rentRoom(currentRoom.id, 60);
      setRentalCountdown(Math.max(0, Math.ceil((Date.parse(result.endsAt) - Date.now()) / 1000)));
      setBlockedReason('');
      await refreshMonetization();
    } catch (error) {
      setBlockedReason(error.message);
    }
  }

  function handleApplyControlConfig(nextConfig) {
    const safe = sanitizeControlConfig(nextConfig);
    setControlConfig(safe);
    localStorage.setItem(CONTROL_CONFIG_STORAGE_KEY, JSON.stringify(safe));
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

  const movementProfile = controlConfig.movementTypes.find((m) => m.id === controlConfig.activeMovementType)
    || controlConfig.movementTypes[0];
  const characterProfile = controlConfig.characterTypes.find((c) => c.id === controlConfig.activeCharacterType)
    || controlConfig.characterTypes[0];

  return (
    <div style={styles.container}>
      <HUD
        user={user}
        currentRoom={currentRoom}
        onlineCount={Object.keys(avatars).length}
        nearbyCount={nearbyIds.length}
        tokenBalance={tokenBalance}
        aiSubscription={aiSubscription}
        rentalCountdown={rentalCountdown}
        blockedReason={blockedReason}
        chatMode={chatMode}
        onChatModeChange={setChatMode}
        onJoinRoom={handleJoinRoom}
        onOpenControlPanel={() => setControlPanelOpen(true)}
        onBuyWithStripe={() => handleBuy('stripe')}
        onBuyWithMpesa={() => handleBuy('mpesa')}
        onSubscribeAI={handleSubscribeAI}
        onRentRoom={handleRentRoom}
        onLogout={handleLogout}
        connected={connected}
      />

      <div style={styles.main}>
        <WorldCanvas
          world={world}
          avatars={Object.values(avatars)}
          myUserId={myIdRef.current}
          nearbyIds={nearbyIds}
          onIntent={handleAvatarIntent}
          onIdle={handleAvatarIdle}
          movementProfile={movementProfile}
          characterProfile={characterProfile}
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

      <ControlPanel
        open={controlPanelOpen}
        config={controlConfig}
        onApply={handleApplyControlConfig}
        onClose={() => setControlPanelOpen(false)}
      />

      {recentTransactions.length > 0 ? (
        <div style={styles.txPanel}>
          <strong style={styles.txTitle}>Recent Transactions</strong>
          {recentTransactions.slice(0, 5).map((tx, index) => (
            <div key={tx.id || tx.intentId || `${tx.type || 'event'}-${index}`} style={styles.txRow}>
              {tx.type || tx.provider || 'event'} • {tx.description || tx.status || 'created'}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function sanitizeControlConfig(input) {
  const movementTypes = Array.isArray(input?.movementTypes)
    ? input.movementTypes
        .filter((m) => m && typeof m.id === 'string')
        .map((m) => ({
          id: m.id,
          label: typeof m.label === 'string' ? m.label : m.id,
          controller: ['steer', 'tap', 'grid'].includes(m.controller) ? m.controller : 'steer',
          speedMultiplier: Number.isFinite(Number(m.speedMultiplier)) ? Number(m.speedMultiplier) : 1,
        }))
    : [];

  const characterTypes = Array.isArray(input?.characterTypes)
    ? input.characterTypes
        .filter((c) => c && typeof c.id === 'string')
        .map((c) => ({
          id: c.id,
          label: typeof c.label === 'string' ? c.label : c.id,
          shape: c.shape === 'block' ? 'block' : 'circle',
          size: Number.isFinite(Number(c.size)) ? Number(c.size) : 36,
        }))
    : [];

  const safeMovementTypes = movementTypes.length > 0 ? movementTypes : DEFAULT_CONTROL_CONFIG.movementTypes;
  const safeCharacterTypes = characterTypes.length > 0 ? characterTypes : DEFAULT_CONTROL_CONFIG.characterTypes;

  const safeActiveMovement = safeMovementTypes.some((m) => m.id === input?.activeMovementType)
    ? input.activeMovementType
    : safeMovementTypes[0].id;
  const safeActiveCharacter = safeCharacterTypes.some((c) => c.id === input?.activeCharacterType)
    ? input.activeCharacterType
    : safeCharacterTypes[0].id;

  return {
    movementTypes: safeMovementTypes,
    characterTypes: safeCharacterTypes,
    activeMovementType: safeActiveMovement,
    activeCharacterType: safeActiveCharacter,
  };
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
  txPanel: {
    position: 'fixed',
    right: 12,
    bottom: 12,
    width: 280,
    background: 'rgba(10,14,24,0.86)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: '8px 10px',
    color: '#d9e6ff',
    fontSize: 12,
  },
  txTitle: {
    display: 'block',
    marginBottom: 6,
  },
  txRow: {
    padding: '4px 0',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
};
