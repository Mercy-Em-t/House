import React, { useState } from 'react';
import LoginForm from './LoginForm.jsx';
import RegisterForm from './RegisterForm.jsx';

export default function AuthPage({ onSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {/* Logo / title */}
        <div style={styles.logo}>
          <span style={styles.logoIcon}>🏠</span>
          <h1 style={styles.title}>House</h1>
          <p style={styles.subtitle}>Virtual Workspace</p>
        </div>

        {/* Tab switcher */}
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(mode === 'login' ? styles.tabActive : {}) }}
            onClick={() => setMode('login')}
          >
            Sign In
          </button>
          <button
            style={{ ...styles.tab, ...(mode === 'register' ? styles.tabActive : {}) }}
            onClick={() => setMode('register')}
          >
            Register
          </button>
        </div>

        {mode === 'login' ? (
          <LoginForm onSuccess={onSuccess} />
        ) : (
          <RegisterForm onSuccess={onSuccess} onSwitch={() => setMode('login')} />
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '40px 36px',
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
  },
  logo: {
    textAlign: 'center',
    marginBottom: 28,
  },
  logoIcon: {
    fontSize: 48,
    display: 'block',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 800,
    color: '#1a1a2e',
    margin: 0,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    margin: '4px 0 0',
  },
  tabs: {
    display: 'flex',
    marginBottom: 28,
    borderRadius: 8,
    overflow: 'hidden',
    border: '1px solid #e0e0e0',
  },
  tab: {
    flex: 1,
    padding: '10px 0',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    color: '#888',
    transition: 'all 0.2s',
  },
  tabActive: {
    background: '#1a1a2e',
    color: '#fff',
  },
};
