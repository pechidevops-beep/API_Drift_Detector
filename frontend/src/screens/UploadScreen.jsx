/**
 * screens/UploadScreen.jsx
 *
 * The entry screen: two drag-and-drop spec file zones side-by-side,
 * divided by a hairline, with a single CTA to compare.
 *
 * Design notes (from design.md):
 *  - Not two separate cards — one continuous surface split by a rule
 *  - Drop zone text uses mono face
 *  - No rounded corners on the outer panel (diff panel style)
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { runDiff } from '../api/client';

function DropZone({ label, version, file, onFile, error }) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }, [onFile]);

  const handleChange = (e) => {
    const f = e.target.files[0];
    if (f) onFile(f);
  };

  return (
    <div
      className={`drop-zone${dragging ? ' drag-over' : ''}${file ? ' has-file' : ''}${error ? ' has-error' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        id={`file-input-${version}`}
        type="file"
        accept=".yaml,.yml,.json"
        onChange={handleChange}
      />

      <div style={{ fontSize: 28, opacity: file ? 0.8 : 0.3 }}>
        {file ? '✓' : '⬆'}
      </div>

      {file ? (
        <>
          <div className="drop-zone-filename">{file.name}</div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--safe)',
            opacity: 0.7,
          }}>
            {(file.size / 1024).toFixed(1)} KB — click to replace
          </div>
        </>
      ) : (
        <div className="drop-zone-label">
          <strong>drop {label}</strong>
          <br />
          or click to browse
          <br />
          <span style={{ fontSize: 11, opacity: 0.6 }}>.yaml · .yml · .json</span>
        </div>
      )}

      {error && (
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--breaking)',
          marginTop: 4,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

export default function UploadScreen({ onResult }) {
  const [v1, setV1] = useState(null);
  const [v2, setV2] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showColdStart, setShowColdStart] = useState(false);

  // Only show the cold-start message once per browser session
  const coldStartShownRef = useRef(
    typeof sessionStorage !== 'undefined' && sessionStorage.getItem('coldStartShown') === '1'
  );
  const coldStartTimerRef = useRef(null);

  const canCompare = v1 && v2 && !loading;

  const handleCompare = async () => {
    if (!canCompare) return;
    setLoading(true);
    setError(null);

    // Cold-start message: show after 8s on the first request in this session
    if (!coldStartShownRef.current) {
      coldStartTimerRef.current = setTimeout(() => {
        setShowColdStart(true);
      }, 8000);
    }

    try {
      const result = await runDiff(v1, v2);
      // Hide cold-start message and mark session so it won't show again
      clearTimeout(coldStartTimerRef.current);
      setShowColdStart(false);
      coldStartShownRef.current = true;
      sessionStorage.setItem('coldStartShown', '1');
      onResult(result, v1, v2);
    } catch (err) {
      clearTimeout(coldStartTimerRef.current);
      setShowColdStart(false);
      const msg = err.response?.data?.error || err.message || 'Unknown error';
      setError(`Failed to analyze specs: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  // Clean up timer on unmount
  useEffect(() => () => clearTimeout(coldStartTimerRef.current), []);

  return (
    <main style={{
      minHeight: 'calc(100vh - 52px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--sp-8) var(--sp-6)',
    }}>
      {/* Hero text */}
      <div className="animate-in" style={{ textAlign: 'center', marginBottom: 'var(--sp-8)' }}>
        <h1 className="font-display text-3xl tracking-tight" style={{ marginBottom: 'var(--sp-2)' }}>
          API Contract Drift Detector
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          Upload two OpenAPI specs — get an exact, classified diff in seconds
        </p>
      </div>

      {/* Upload panel */}
      <div
        className="animate-in delay-1"
        style={{
          width: '100%',
          maxWidth: 860,
          background: 'var(--surface-raised)',
          border: '1px solid var(--border-hairline)',
          borderRadius: 'var(--radius-card)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-raised)',
        }}
      >
        {/* Panel header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--sp-4) var(--sp-6)',
          borderBottom: '1px solid var(--border-hairline)',
        }}>
          <div style={{ display: 'flex', gap: 'var(--sp-4)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            <span style={{ color: 'var(--text-secondary)' }}>v1</span>
            <span style={{ color: 'var(--border-hairline)' }}>→</span>
            <span style={{ color: 'var(--text-secondary)' }}>v2</span>
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
            OpenAPI 3.x
          </span>
        </div>

        {/* Drop zones */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr' }}>
          <div style={{ padding: 'var(--sp-6)' }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-secondary)',
              marginBottom: 'var(--sp-3)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}>
              Original spec
            </div>
            <DropZone label="spec-v1.yaml" version="v1" file={v1} onFile={setV1} />
          </div>

          {/* Hairline divider */}
          <div style={{ background: 'var(--border-hairline)', alignSelf: 'stretch' }} />

          <div style={{ padding: 'var(--sp-6)' }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-secondary)',
              marginBottom: 'var(--sp-3)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}>
              New spec
            </div>
            <DropZone label="spec-v2.yaml" version="v2" file={v2} onFile={setV2} />
          </div>
        </div>

        {/* CTA */}
        <div style={{
          padding: 'var(--sp-4) var(--sp-6)',
          borderTop: '1px solid var(--border-hairline)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          {error ? (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--breaking)' }}>
              {error}
            </span>
          ) : showColdStart ? (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16 }}>⏳</span>
              Server is waking up — first load on free hosting takes ~30 seconds. Hang tight.
            </span>
          ) : (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
              {v1 && v2 ? 'Ready to compare' : 'Upload both specs to continue'}
            </span>
          )}

          <button
            className="btn btn-primary"
            disabled={!canCompare}
            onClick={handleCompare}
            style={{ opacity: canCompare ? 1 : 0.4, cursor: canCompare ? 'pointer' : 'not-allowed' }}
          >
            {loading ? (
              <>
                <div className="spinner" style={{ width: 14, height: 14 }} />
                Analyzing…
              </>
            ) : (
              'Compare Specs →'
            )}
          </button>
        </div>
      </div>
    </main>
  );
}
