/**
 * screens/DiffScreen.jsx
 *
 * The main result screen. Top-to-bottom layout per design.md:
 *   1. Display-face title + version meta
 *   2. Summary banner (breaking / warning / safe counts)
 *   3. Fault-line SVG (full width, the hero moment)
 *   4. Monaco side-by-side diff
 *   5. Filter tabs + change list
 *   6. "Generate Migration Guide" CTA
 */
import { useState } from 'react';
import Editor from '@monaco-editor/react';
import FaultLine from '../components/FaultLine';
import ChangeList from '../components/ChangeList';
import { generateMigrationGuide } from '../api/client';

const MONACO_OPTIONS = {
  readOnly: true,
  fontSize: 12,
  fontFamily: "'JetBrains Mono', monospace",
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  lineNumbers: 'on',
  renderSideBySide: true,
  theme: 'vs-dark',
  scrollbar: { verticalScrollbarSize: 6 },
};

function SummaryBanner({ summary }) {
  return (
    <div className="summary-banner animate-in" style={{ flexWrap: 'wrap', gap: 'var(--sp-8)' }}>
      <div className="summary-stat">
        <span className="summary-stat-value text-breaking">{summary.breakingCount}</span>
        <span className="summary-stat-label">Breaking</span>
      </div>
      <div style={{ width: 1, background: 'var(--border-hairline)', alignSelf: 'stretch' }} />
      <div className="summary-stat">
        <span className="summary-stat-value" style={{ color: 'var(--warning)' }}>{summary.warningCount}</span>
        <span className="summary-stat-label">Warning</span>
      </div>
      <div style={{ width: 1, background: 'var(--border-hairline)', alignSelf: 'stretch' }} />
      <div className="summary-stat">
        <span className="summary-stat-value text-safe">{summary.nonBreakingCount}</span>
        <span className="summary-stat-label">Non-breaking</span>
      </div>
      <div style={{ width: 1, background: 'var(--border-hairline)', alignSelf: 'stretch' }} />
      <div className="summary-stat">
        <span className="summary-stat-value" style={{ color: 'var(--text-secondary)' }}>{summary.total}</span>
        <span className="summary-stat-label">Total changes</span>
      </div>
    </div>
  );
}

export default function DiffScreen({ result, v1Text, v2Text, onBack, user, onRequestAuth }) {
  const [guideState, setGuideState] = useState('idle'); // idle | loading | done | error
  const [guide, setGuide] = useState(null);
  const [guideError, setGuideError] = useState(null);
  const [showMonaco, setShowMonaco] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  const { meta, summary, changes } = result;

  const handleGenerateGuide = async () => {
    setGuideState('loading');
    setGuideError(null);
    try {
      const data = await generateMigrationGuide(result.id);
      setGuide(data.guide);
      setGuideState('done');
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error || err.message;
      if (status === 429) {
        setGuideError(`\u23f1 ${msg}`);
      } else if (status === 404) {
        setGuideError('This diff has expired (2 hour TTL). Re-upload the specs and try again.');
      } else {
        setGuideError(msg || 'Guide generation failed. Try again in a moment.');
      }
      setGuideState('error');
    }
  };

  return (
    <main style={{ padding: 'var(--sp-8) var(--sp-6)', maxWidth: 1200, margin: '0 auto' }}>

      {/* Back + title row */}
      <div className="flex items-center gap-4 animate-in" style={{ marginBottom: 'var(--sp-6)' }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ fontSize: 12 }}>
          ← New comparison
        </button>
        <div style={{ flex: 1 }}>
          <h1 className="font-display text-2xl tracking-tight">
            Contract Drift Report
          </h1>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-secondary)',
            marginTop: 4,
          }}>
            {meta.v1Name} → {meta.v2Name}
            <span style={{ marginLeft: 12, opacity: 0.5 }}>
              · {new Date(meta.analyzedAt).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Summary banner */}
      <div style={{ marginBottom: 'var(--sp-4)' }}>
        <SummaryBanner summary={summary} />
      </div>

      {/* Fault line — the hero moment */}
      <div className="animate-in delay-2" style={{ marginBottom: 'var(--sp-4)' }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text-secondary)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 'var(--sp-2)',
        }}>
          Drift trace — {summary.breakingCount} breaking spike{summary.breakingCount !== 1 ? 's' : ''} detected
        </div>
        <FaultLine changes={changes} />
      </div>

      {/* Monaco diff toggle */}
      <div className="animate-in delay-3" style={{ marginBottom: 'var(--sp-4)' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--sp-2)',
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-secondary)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            Raw spec diff
          </span>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 11 }}
            onClick={() => setShowMonaco(s => !s)}
          >
            {showMonaco ? 'Hide diff' : 'Show raw diff'}
          </button>
        </div>
        {showMonaco && v1Text && v2Text && (
          <div className="monaco-wrapper">
            <Editor
              height="480px"
              defaultLanguage="yaml"
              original={v1Text}
              modified={v2Text}
              options={MONACO_OPTIONS}
              theme="vs-dark"
            />
          </div>
        )}
      </div>

      {/* Change list */}
      <div className="animate-in delay-4" style={{ marginBottom: 'var(--sp-6)' }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text-secondary)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 'var(--sp-2)',
        }}>
          Changes ({summary.total})
        </div>
        <ChangeList changes={changes} />
      </div>

      {/* Migration guide CTA / result */}
      <div className="animate-in delay-5" style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--border-hairline)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--sp-6)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: guide || guideError ? 'var(--sp-6)' : 0,
        }}>
          <div>
            <div className="font-display" style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
              Migration Guide
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              AI-generated step-by-step instructions for each breaking change
            </div>
          </div>
          {/* Generate Guide button — auth-gated for guests */}
          {user ? (
            <button
              className="btn btn-primary"
              onClick={handleGenerateGuide}
              disabled={guideState === 'loading' || guideState === 'done'}
              style={{ opacity: (guideState === 'loading' || guideState === 'done') ? 0.5 : 1 }}
            >
              {guideState === 'loading' ? (
                <><div className="spinner" style={{ width: 14, height: 14 }} /> Generating…</>
              ) : guideState === 'done' ? (
                '✓ Generated'
              ) : (
                'Generate Guide'
              )}
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => setShowAuthPrompt(s => !s)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              🔒 Generate Guide
            </button>
          )}
        </div>

        {/* Inline auth prompt for guests — slides in below the header row */}
        {showAuthPrompt && !user && (
          <div style={{
            background: 'var(--surface-overlay)',
            border: '1px solid var(--border-hairline)',
            borderRadius: 'var(--radius-card)',
            padding: 'var(--sp-4) var(--sp-5)',
            marginBottom: 'var(--sp-4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--sp-3)',
          }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Sign in to generate an AI migration guide for each breaking change.
            </span>
            <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 12 }}
                onClick={onRequestAuth}
              >
                Log in
              </button>
              <button
                className="btn btn-primary"
                style={{ fontSize: 12 }}
                onClick={onRequestAuth}
              >
                Sign up free
              </button>
            </div>
          </div>
        )}

        {guideState === 'error' && (
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--warning)',
            padding: 'var(--sp-3)',
            background: 'var(--warning-low)',
            borderRadius: 'var(--radius-card)',
            border: '1px solid rgba(245,166,35,0.2)',
          }}>
            {guideError}
          </div>
        )}

        {guide && (
          <div className="migration-doc" style={{ margin: 0, padding: 0 }}>
            <pre style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--text-primary)',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.7,
            }}>
              {guide}
            </pre>
          </div>
        )}
      </div>
    </main>
  );
}
