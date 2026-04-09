import React, { useState } from 'react';
import { register } from '../../services/auth';

export default function RegisterForm({ onSuccess }) {
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const { user } = await register(form.username, form.email, form.password);
      onSuccess(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      {error && <div style={styles.error}>{error}</div>}
      <label style={styles.label}>
        Username
        <input
          style={styles.input}
          type="text"
          name="username"
          value={form.username}
          onChange={handleChange}
          required
          autoComplete="username"
          placeholder="Your name in the world"
        />
      </label>
      <label style={styles.label}>
        Email
        <input
          style={styles.input}
          type="email"
          name="email"
          value={form.email}
          onChange={handleChange}
          required
          autoComplete="email"
          placeholder="you@example.com"
        />
      </label>
      <label style={styles.label}>
        Password
        <input
          style={styles.input}
          type="password"
          name="password"
          value={form.password}
          onChange={handleChange}
          required
          autoComplete="new-password"
          placeholder="••••••••"
        />
      </label>
      <label style={styles.label}>
        Confirm Password
        <input
          style={styles.input}
          type="password"
          name="confirm"
          value={form.confirm}
          onChange={handleChange}
          required
          autoComplete="new-password"
          placeholder="••••••••"
        />
      </label>
      <button type="submit" style={styles.btn} disabled={loading}>
        {loading ? 'Creating account…' : 'Create Account'}
      </button>
    </form>
  );
}

const styles = {
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: '#444' },
  input: {
    padding: '10px 14px',
    border: '1.5px solid #e0e0e0',
    borderRadius: 8,
    fontSize: 14,
    outline: 'none',
  },
  btn: {
    marginTop: 8,
    padding: '12px',
    background: '#0f3460',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
  },
  error: {
    padding: '10px 14px',
    background: '#fff0f0',
    border: '1px solid #ffcdd2',
    borderRadius: 8,
    color: '#c62828',
    fontSize: 13,
  },
};
