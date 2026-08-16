/**
 * screens/AuthScreen.jsx
 *
 * Single card with Login / Sign Up tab toggle.
 *
 * Design spec:
 * - Contained card, ~420px wide, centered on --surface-base background
 * - Tab sliding underline animation (same spring as ChangeList.jsx filter tabs)
 * - Inline error messages mapped from Supabase error codes — never raw SDK strings
 * - Loading spinner inside submit button with no layout shift
 * - Mobile responsive: 16px horizontal padding below 480px, 44px touch targets
 */

import { useState } from 'react';
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Map Supabase error messages to friendly copy
// ---------------------------------------------------------------------------
function mapAuthError(error) {
  if (!error) return null;
  const msg = error.message?.toLowerCase() || '';

  if (msg.includes('invalid login credentials') || msg.includes('invalid email or password')) {
    return 'Incorrect email or password.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Please confirm your email address first. Check your inbox.';
  }
  if (msg.includes('user already registered') || msg.includes('already been registered')) {
    return 'An account with this email already exists. Log in instead?';
  }
  if (msg.includes('password') && msg.includes('least')) {
    return 'Password must be at least 8 characters.';
  }
  if (msg.includes('unable to validate') || msg.includes('user not found')) {
    return 'No account found with this email. Sign up instead?';
  }
  if (msg.includes('rate limit')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  // Fallback: generic — don't expose raw Supabase error text
  return 'Something went wrong. Please try again.';
}

// ---------------------------------------------------------------------------
// Spinner component — inline, sized to fit inside the button
// ---------------------------------------------------------------------------
function Spinner() {
  return (
    <svg
      className="auth-spinner"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// AuthScreen
// ---------------------------------------------------------------------------
export default function AuthScreen({ onAuthSuccess }) {
  const [tab, setTab]         = useState('login');   // 'login' | 'signup'
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const isLogin = tab === 'login';

  const handleTabChange = (newTab) => {
    if (newTab === tab) return;
    setTab(newTab);
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let result;
      if (isLogin) {
        result = await supabase.auth.signInWithPassword({ email, password });
      } else {
        result = await supabase.auth.signUp({ email, password });
      }

      if (result.error) {
        setError(mapAuthError(result.error));
        return;
      }

      // Sign up returns a user with no session if email confirmation is required
      if (!isLogin && !result.data?.session) {
        setError('Account created! Check your inbox for a confirmation link, then come back and log in.');
        setTab('login');
        setPassword('');
        return;
      }


      onAuthSuccess(result.data.session);
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        {/* Logomark */}
        <div className="auth-logo">
          <div className="auth-logo-dot" />
          <span className="auth-logo-text">Drift Detector</span>
        </div>

        <h1 className="auth-title">{isLogin ? 'Welcome back' : 'Create account'}</h1>
        <p className="auth-subtitle">
          {isLogin
            ? 'Log in to view your timeline and generate migration guides.'
            : 'Sign up to save your diffs and generate AI migration guides.'}
        </p>

        {/* Tab toggle */}
        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button
            role="tab"
            aria-selected={isLogin}
            className={`auth-tab${isLogin ? ' active' : ''}`}
            onClick={() => handleTabChange('login')}
            type="button"
          >
            Log in
          </button>
          <button
            role="tab"
            aria-selected={!isLogin}
            className={`auth-tab${!isLogin ? ' active' : ''}`}
            onClick={() => handleTabChange('signup')}
            type="button"
          >
            Sign up
          </button>
          {/* Sliding underline */}
          <div
            className="auth-tab-underline"
            style={{ transform: `translateX(${isLogin ? '0%' : '100%'})` }}
          />
        </div>

        {/* Form */}
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              className="auth-input"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(null); }}
              autoComplete={isLogin ? 'username' : 'email'}
              required
              disabled={loading}
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              className="auth-input"
              type="password"
              placeholder="at least 8 characters"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(null); }}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              required
              disabled={loading}
            />
          </div>

          {/* Inline error */}
          {error && (
            <p className="auth-error" role="alert" aria-live="polite">
              {error}
            </p>
          )}

          <button
            id="auth-submit-btn"
            className="auth-submit"
            type="submit"
            disabled={loading || !email || !password}
          >
            {loading ? (
              <>
                <Spinner />
                <span>{isLogin ? 'Logging in…' : 'Creating account…'}</span>
              </>
            ) : (
              isLogin ? 'Log in' : 'Create account'
            )}
          </button>
        </form>

        {/* Swap tab hint */}
        <p className="auth-swap">
          {isLogin ? (
            <>Don't have an account?{' '}
              <button className="auth-swap-link" onClick={() => handleTabChange('signup')} type="button">
                Sign up free
              </button>
            </>
          ) : (
            <>Already have an account?{' '}
              <button className="auth-swap-link" onClick={() => handleTabChange('login')} type="button">
                Log in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
