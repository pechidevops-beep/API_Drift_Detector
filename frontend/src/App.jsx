/**
 * App.jsx — root router
 *
 * State machine:
 *   unauthenticated + no diff  → UploadScreen   (guests land here)
 *   unauthenticated + diff     → DiffScreen      (guests see results)
 *   authenticated + no diff    → UploadScreen
 *   authenticated + diff       → DiffScreen      (guide button fully active)
 *   authenticated + timeline   → TimelineScreen  (auth-gated)
 *   'auth'                     → AuthScreen      (login/signup)
 *
 * Auth is managed by Supabase — the session persists in localStorage so users
 * stay logged in across page refreshes. onAuthStateChange keeps UI in sync.
 */

import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import UploadScreen   from './screens/UploadScreen';
import DiffScreen     from './screens/DiffScreen';
import TimelineScreen from './screens/TimelineScreen';
import AuthScreen     from './screens/AuthScreen';
import { getDiffById } from './api/client';

// ---------------------------------------------------------------------------
// AppHeader
// ---------------------------------------------------------------------------
function AppHeader({ screen, user, onNav, onSignOut }) {
  return (
    <header className="app-header">
      <div className="app-logo" onClick={() => onNav('upload')} style={{ cursor: 'pointer' }}>
        <div className="app-logo-signal" />
        Drift Detector
      </div>
      <nav className="nav-links">
        <button
          className={`nav-link${screen === 'upload' || screen === 'diff' ? ' active' : ''}`}
          onClick={() => onNav('upload')}
        >
          Compare
        </button>
        {user ? (
          <button
            className={`nav-link${screen === 'timeline' ? ' active' : ''}`}
            onClick={() => onNav('timeline')}
          >
            Timeline
          </button>
        ) : null}
        {user ? (
          <button className="nav-link nav-link-signout" onClick={onSignOut} title={`Signed in as ${user.email}`}>
            Sign out
          </button>
        ) : (
          <button
            className={`nav-link${screen === 'auth' ? ' active' : ''}`}
            onClick={() => onNav('auth')}
          >
            Log in
          </button>
        )}
      </nav>
    </header>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  const [screen, setScreen]   = useState('upload');
  const [result, setResult]   = useState(null);
  const [v1Text, setV1Text]   = useState('');
  const [v2Text, setV2Text]   = useState('');
  const [user, setUser]       = useState(null);
  const [authLoading, setAuthLoading] = useState(true); // true until Supabase resolves session

  // Listen to Supabase auth state changes (login, logout, token refresh)
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleResult = (diffResult, rawV1, rawV2) => {
    setResult(diffResult);
    setV1Text(rawV1 || '');
    setV2Text(rawV2 || '');
    setScreen('diff');
  };

  const handleNav = (target) => {
    // Timeline is auth-gated — redirect to auth screen if not logged in
    if (target === 'timeline' && !user) {
      setScreen('auth');
      return;
    }
    setScreen(target);
    if (target === 'upload') {
      setResult(null);
      setV1Text('');
      setV2Text('');
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setResult(null);
    setV1Text('');
    setV2Text('');
    setScreen('upload');
  };

  const handleAuthSuccess = (session) => {
    setUser(session?.user ?? null);
    // After login, go back to wherever the user was (or upload if no diff)
    setScreen(result ? 'diff' : 'upload');
  };

  const handleSelectDiffFromTimeline = async (id) => {
    try {
      const data = await getDiffById(id);
      setResult(data);
      setV1Text('');
      setV2Text('');
      setScreen('diff');
    } catch (err) {
      alert('Failed to load diff: ' + err.message);
    }
  };

  // UploadScreen needs to pass file text up so Monaco can use it
  const UploadWithTextCapture = () => (
    <UploadScreen
      onResult={async (diffResult, v1File, v2File) => {
        const readText = (file) =>
          file
            ? new Promise(r => { const fr = new FileReader(); fr.onload = e => r(e.target.result); fr.readAsText(file); })
            : Promise.resolve('');
        const [t1, t2] = await Promise.all([readText(v1File), readText(v2File)]);
        handleResult(diffResult, t1, t2);
      }}
    />
  );

  // Wait for Supabase to resolve the session before rendering (prevents flicker)
  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="app-logo-signal" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader screen={screen} user={user} onNav={handleNav} onSignOut={handleSignOut} />
      {screen === 'upload'   && <UploadWithTextCapture />}
      {screen === 'auth'     && <AuthScreen onAuthSuccess={handleAuthSuccess} />}
      {screen === 'timeline' && user && <TimelineScreen onSelectDiff={handleSelectDiffFromTimeline} />}
      {screen === 'diff'     && result && (
        <DiffScreen
          result={result}
          v1Text={v1Text}
          v2Text={v2Text}
          onBack={() => handleNav('upload')}
          user={user}
          onRequestAuth={() => setScreen('auth')}
        />
      )}
    </div>
  );
}
