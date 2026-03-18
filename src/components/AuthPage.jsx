import React, { useState } from 'react';
import { useAuth } from '../auth';

export default function AuthPage() {
  const { signIn, signUp, signInWithGoogle, resetPassword, updatePassword, recoveryMode } = useAuth();
  const [mode, setMode] = useState('login'); // login | register | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Show "Set new password" form when user arrives via reset email link
  if (recoveryMode) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-title">Study</h1>
          <p className="auth-subtitle">Set your new password</p>

          {error && <div className="auth-error">{error}</div>}
          {message && <div className="auth-message">{message}</div>}

          <form onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            setMessage('');
            if (password.length < 6) {
              setError('Password must be at least 6 characters');
              return;
            }
            if (password !== confirmPassword) {
              setError('Passwords do not match');
              return;
            }
            setLoading(true);
            const { error } = await updatePassword(password);
            if (error) {
              setError(error.message);
            } else {
              setMessage('Password updated successfully! Redirecting...');
              setTimeout(() => window.location.reload(), 1500);
            }
            setLoading(false);
          }}>
            <div className="form-group">
              <label>New Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
            <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (mode === 'reset') {
        const { error } = await resetPassword(email);
        if (error) throw error;
        setMessage('If an account exists with that email, you\'ll receive a password reset link shortly. Check your inbox and spam folder.');
        setLoading(false);
        return;
      }

      if (mode === 'register') {
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters');
          setLoading(false);
          return;
        }
        const { error } = await signUp(email, password);
        if (error) throw error;
        setMessage('Check your email to confirm your account.');
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    }
    setLoading(false);
  }

  async function handleGoogle() {
    setError('');
    const { error } = await signInWithGoogle();
    if (error) setError(error.message);
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Study</h1>
        <p className="auth-subtitle">
          {mode === 'login' && 'Sign in to your account'}
          {mode === 'register' && 'Create a new account'}
          {mode === 'reset' && 'Reset your password'}
        </p>
        {mode === 'reset' && (
          <p className="auth-hint">Enter the email address you used to create your account</p>
        )}

        {error && <div className="auth-error">{error}</div>}
        {message && <div className="auth-message">{message}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>

          {mode !== 'reset' && (
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          )}

          {mode === 'register' && (
            <div className="form-group">
              <label>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          )}

          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Send Reset Link'}
          </button>
        </form>

        {mode !== 'reset' && (
          <>
            <div className="auth-divider"><span>or</span></div>
            <button className="btn auth-google" onClick={handleGoogle}>
              Continue with Google
            </button>
          </>
        )}

        <div className="auth-links">
          {mode === 'login' && (
            <>
              <button className="btn-ghost auth-link" onClick={() => { setMode('register'); setError(''); setMessage(''); }}>
                Create an account
              </button>
              <button className="btn-ghost auth-link" onClick={() => { setMode('reset'); setError(''); setMessage(''); }}>
                Forgot password?
              </button>
            </>
          )}
          {mode === 'register' && (
            <button className="btn-ghost auth-link" onClick={() => { setMode('login'); setError(''); setMessage(''); }}>
              Already have an account? Sign in
            </button>
          )}
          {mode === 'reset' && (
            <button className="btn-ghost auth-link" onClick={() => { setMode('login'); setError(''); setMessage(''); }}>
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
