import React, { useEffect, useState } from 'react';

export default function ControlPanel({ open, config, onApply, onClose }) {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setRaw(JSON.stringify(config, null, 2));
      setError('');
    }
  }, [open, config]);

  if (!open) return null;

  function handleApply() {
    try {
      const parsed = JSON.parse(raw);
      onApply(parsed);
      setError('');
      onClose();
    } catch (err) {
      setError(`Invalid JSON: ${err.message}`);
    }
  }

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>Control Panel</h3>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <p style={styles.help}>
          Define movement types and character types through JSON.
          Use <code>controller</code> values: <code>steer</code>, <code>tap</code>, <code>grid</code>.
        </p>

        <textarea
          style={styles.textarea}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          spellCheck={false}
        />

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.actions}>
          <button style={styles.secondaryBtn} onClick={() => setRaw(JSON.stringify(config, null, 2))}>
            Reset
          </button>
          <button style={styles.primaryBtn} onClick={handleApply}>
            Save JSON
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  panel: {
    width: 'min(860px, 92vw)',
    maxHeight: '84vh',
    overflow: 'auto',
    background: '#111528',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 16,
    color: '#d6dbef',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    margin: 0,
    fontSize: 16,
  },
  closeBtn: {
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'transparent',
    color: '#9aa3c2',
    borderRadius: 6,
    cursor: 'pointer',
    width: 30,
    height: 30,
  },
  help: {
    margin: '0 0 10px',
    fontSize: 12,
    color: '#9aa3c2',
  },
  textarea: {
    width: '100%',
    minHeight: 380,
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.15)',
    background: '#0a0f1f',
    color: '#d6dbef',
    padding: 12,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 12,
    lineHeight: 1.45,
    resize: 'vertical',
  },
  error: {
    marginTop: 10,
    color: '#ff7f9f',
    fontSize: 12,
  },
  actions: {
    marginTop: 12,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
  },
  secondaryBtn: {
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'transparent',
    color: '#9aa3c2',
    borderRadius: 6,
    padding: '7px 12px',
    cursor: 'pointer',
  },
  primaryBtn: {
    border: '1px solid #3498db',
    background: 'rgba(52,152,219,0.2)',
    color: '#9bd4ff',
    borderRadius: 6,
    padding: '7px 12px',
    cursor: 'pointer',
  },
};
