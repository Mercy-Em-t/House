import React, { useState, useEffect } from 'react';
import { getToken, getStoredUser, logout } from './services/auth';
import { connect, disconnect } from './services/socket';
import AuthPage from './components/Auth/AuthPage.jsx';
import WorldView from './components/World/WorldView.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore session from localStorage on mount
    const token = getToken();
    const stored = getStoredUser();
    if (token && stored) {
      setUser(stored);
    }
    setLoading(false);
  }, []);

  function handleAuthSuccess(userData) {
    setUser(userData);
  }

  function handleLogout() {
    disconnect();
    logout();
    setUser(null);
  }

  if (loading) {
    return (
      <div style={styles.loading}>
        <div style={styles.spinner} />
        <p>Loading House…</p>
      </div>
    );
  }

  if (!user) {
    return <AuthPage onSuccess={handleAuthSuccess} />;
  }

  return <WorldView user={user} onLogout={handleLogout} />;
}

const styles = {
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    gap: 16,
    color: '#555',
    fontSize: 18,
  },
  spinner: {
    width: 40,
    height: 40,
    border: '4px solid #e0e0e0',
    borderTopColor: '#3498db',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};
