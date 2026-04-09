import React, { useState, useRef, useEffect } from 'react';

/**
 * ChatPanel
 *
 * Displays room/proximity/global chat messages and provides an input box.
 *
 * Props:
 *  messages     – array of message objects
 *  myUserId     – current user's ID (to style own messages differently)
 *  currentRoom  – room object or null
 *  chatMode     – 'room' | 'proximity' | 'global'
 *  onSend       – callback(content: string)
 */
export default function ChatPanel({ messages, myUserId, currentRoom, chatMode, onSend }) {
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input);
    setInput('');
  }

  // Filter messages relevant to the current chat mode / room
  const visible = messages.filter((m) => {
    if (m.type === 'global') return true; // global messages are always visible
    if (chatMode === 'room') return m.type === 'room' && m.roomId === currentRoom?.id;
    if (chatMode === 'proximity') return m.type === 'proximity';
    if (chatMode === 'global') return false; // only global messages shown above
    return true;
  });

  const chatModeLabel = {
    room: currentRoom ? `#${currentRoom.name}` : '#Lobby',
    proximity: '📡 Nearby',
    global: '🌐 Global',
  }[chatMode] || 'Chat';

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>💬 {chatModeLabel}</span>
        <span style={styles.messageCount}>{visible.length} msg</span>
      </div>

      <div style={styles.messages}>
        {visible.length === 0 && (
          <div style={styles.empty}>
            No messages yet. Say hello!
          </div>
        )}
        {visible.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} isMe={msg.senderId === myUserId} />
        ))}
        <div ref={bottomRef} />
      </div>

      <form style={styles.inputRow} onSubmit={handleSubmit}>
        <input
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Message ${chatModeLabel}…`}
          maxLength={500}
          autoComplete="off"
        />
        <button type="submit" style={styles.sendBtn} disabled={!input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ msg, isMe }) {
  const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div style={{ ...styles.bubble, ...(isMe ? styles.bubbleMe : {}) }}>
      <span style={styles.sender}>{isMe ? 'You' : msg.senderName}</span>
      <span style={styles.time}>{time}</span>
      <p style={styles.content}>{msg.content}</p>
    </div>
  );
}

const styles = {
  panel: {
    width: 300,
    display: 'flex',
    flexDirection: 'column',
    background: '#1e1e30',
    borderLeft: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
  },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: '#e0e0e0',
    fontWeight: 700,
    fontSize: 14,
  },
  messageCount: {
    color: '#666',
    fontSize: 12,
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 12px 4px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  empty: {
    color: '#555',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 40,
  },
  bubble: {
    background: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    padding: '8px 10px',
    maxWidth: '100%',
  },
  bubbleMe: {
    background: 'rgba(52,152,219,0.2)',
    alignSelf: 'flex-end',
  },
  sender: {
    fontSize: 12,
    fontWeight: 700,
    color: '#3498db',
    marginRight: 8,
  },
  time: {
    fontSize: 11,
    color: '#555',
  },
  content: {
    fontSize: 13,
    color: '#d0d0d0',
    marginTop: 4,
    wordBreak: 'break-word',
  },
  inputRow: {
    display: 'flex',
    gap: 8,
    padding: '10px 12px',
    borderTop: '1px solid rgba(255,255,255,0.08)',
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.08)',
    color: '#fff',
    fontSize: 13,
    outline: 'none',
  },
  sendBtn: {
    padding: '8px 14px',
    borderRadius: 8,
    border: 'none',
    background: '#3498db',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
};
