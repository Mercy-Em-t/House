import React from 'react';

/**
 * HUD (Heads-Up Display)
 *
 * Top navigation bar showing:
 *  – App logo / name
 *  – Current room
 *  – Online user count & nearby count
 *  – Chat mode selector
 *  – Connection status dot
 *  – Logout button
 *  – Controls hint
 */
export default function HUD({
  user,
  currentRoom,
  onlineCount,
  nearbyCount,
  tokenBalance,
  aiSubscription,
  rentalCountdown,
  blockedReason,
  chatMode,
  onChatModeChange,
  onJoinRoom,
  onOpenControlPanel,
  onBuyWithStripe,
  onBuyWithMpesa,
  onSubscribeAI,
  onRentRoom,
  onLogout,
  connected,
}) {
  return (
    <header style={styles.hud}>
      {/* Left: Logo + room */}
      <div style={styles.left}>
        <span style={styles.logo}>🏠</span>
        <span style={styles.appName}>House</span>
        {currentRoom && (
          <>
            <span style={styles.separator}>›</span>
            <span style={styles.roomName}>{currentRoom.name}</span>
          </>
        )}
      </div>

      {/* Centre: Chat mode switcher */}
      <div style={styles.centre}>
        {['room', 'proximity', 'global'].map((mode) => (
          <button
            key={mode}
            style={{
              ...styles.modeBtn,
              ...(chatMode === mode ? styles.modeBtnActive : {}),
            }}
            onClick={() => onChatModeChange(mode)}
          >
            {mode === 'room' && '🏢 Room'}
            {mode === 'proximity' && '📡 Nearby'}
            {mode === 'global' && '🌐 Global'}
          </button>
        ))}
      </div>

      {/* Right: Stats + controls hint + logout */}
      <div style={styles.right}>
        <Stat icon="🟢" label={`${onlineCount} online`} />
        <Stat icon="📡" label={`${nearbyCount} nearby`} />
        <Stat icon="🪙" label={`${tokenBalance ?? 0} tokens`} />
        <Stat icon="🤖" label={aiSubscription?.active ? 'AI active' : 'AI inactive'} />
        <Stat icon="⏱️" label={rentalCountdown ? `${rentalCountdown}s rental` : 'No rental'} />
        <div style={styles.controls}>🕹️ Drag steer • 1/2/3 modes • F free-look</div>
        <button style={styles.joinBtn} onClick={onJoinRoom} disabled={!currentRoom}>
          Join Room
        </button>
        <button style={styles.buyBtn} onClick={onBuyWithStripe}>Buy (Stripe)</button>
        <button style={styles.buyBtn} onClick={onBuyWithMpesa}>Buy (M-Pesa)</button>
        <button style={styles.buyBtn} onClick={onSubscribeAI}>AI Plan</button>
        <button style={styles.buyBtn} onClick={onRentRoom} disabled={!currentRoom}>Rent</button>
        <button style={styles.settingsBtn} onClick={onOpenControlPanel}>
          ⚙️ Controls
        </button>
        <div style={styles.statusDot(connected)} title={connected ? 'Connected' : 'Disconnected'} />
        <span style={styles.userName}>👤 {user.username}</span>
        <button style={styles.logoutBtn} onClick={onLogout}>
          Sign out
        </button>
      </div>
      {blockedReason ? <div style={styles.blocked}>{blockedReason}</div> : null}
    </header>
  );
}

function Stat({ icon, label }) {
  return (
    <div style={styles.stat}>
      <span>{icon}</span>
      <span style={styles.statLabel}>{label}</span>
    </div>
  );
}

const styles = {
  hud: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    height: 52,
    background: '#12122a',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
    gap: 12,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 160,
  },
  logo: {
    fontSize: 22,
  },
  appName: {
    color: '#fff',
    fontWeight: 800,
    fontSize: 16,
  },
  separator: {
    color: '#555',
    fontSize: 14,
  },
  roomName: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: 600,
  },
  centre: {
    display: 'flex',
    gap: 4,
  },
  modeBtn: {
    padding: '5px 12px',
    borderRadius: 20,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'transparent',
    color: '#888',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  modeBtnActive: {
    background: 'rgba(52,152,219,0.25)',
    borderColor: '#3498db',
    color: '#3498db',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minWidth: 160,
    justifyContent: 'flex-end',
  },
  stat: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 12,
    color: '#888',
  },
  statLabel: {
    color: '#aaa',
  },
  controls: {
    fontSize: 11,
    color: '#555',
    whiteSpace: 'nowrap',
  },
  statusDot: (connected) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: connected ? '#2ecc71' : '#e74c3c',
    flexShrink: 0,
  }),
  userName: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: 600,
  },
  logoutBtn: {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'transparent',
    color: '#888',
    fontSize: 12,
    cursor: 'pointer',
  },
  joinBtn: {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid rgba(52,152,219,0.45)',
    background: 'rgba(52,152,219,0.15)',
    color: '#9bd4ff',
    fontSize: 12,
    cursor: 'pointer',
  },
  settingsBtn: {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid rgba(241,196,15,0.45)',
    background: 'rgba(241,196,15,0.12)',
    color: '#f7dd83',
    fontSize: 12,
    cursor: 'pointer',
  },
  buyBtn: {
    padding: '4px 8px',
    borderRadius: 6,
    border: '1px solid rgba(46, 204, 113, 0.45)',
    background: 'rgba(46, 204, 113, 0.12)',
    color: '#9ff0c0',
    fontSize: 12,
    cursor: 'pointer',
  },
  blocked: {
    position: 'absolute',
    left: 16,
    top: 54,
    color: '#ff9d9d',
    fontSize: 12,
    background: 'rgba(128,0,0,0.2)',
    border: '1px solid rgba(255,120,120,0.4)',
    borderRadius: 6,
    padding: '3px 8px',
  },
};
