/**
 * screens/TimelineScreen.jsx
 *
 * Displays a historical timeline of all diffs run for a specific API.
 * Phase 7 implementation using Supabase data.
 */
import { useState, useEffect } from 'react';
import { getTimeline } from '../api/client';

export default function TimelineScreen({ onSelectDiff }) {
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // For MVP, we'll just fetch all diffs by checking the most recent diff's API name,
    // or just pass a hardcoded name if we want to show all. 
    // Since our backend saves `api_name` as "v1.yaml → v2.yaml", this might be tricky to group by a single API.
    // Wait, let's fetch all diffs if we don't have a specific API name, or just use a default for now.
    // Actually, to make it simple and robust, let's fetch 'spec-v1.yaml → spec-v2.yaml'
    // or better yet, let's modify the backend to return ALL diffs if we pass 'all' or similar?
    // Let's just fetch everything for the MVP.
    async function fetchTimeline() {
      try {
        const data = await getTimeline('all');
        setTimeline(data);
      } catch (err) {
        setError(err.message || 'Failed to load timeline');
      } finally {
        setLoading(false);
      }
    }
    fetchTimeline();
  }, []);

  if (loading) return <div style={{ padding: 'var(--sp-8)', textAlign: 'center' }}>Loading timeline...</div>;
  if (error) return <div style={{ padding: 'var(--sp-8)', textAlign: 'center', color: 'var(--breaking)' }}>{error}</div>;

  return (
    <main style={{ padding: 'var(--sp-8) var(--sp-6)', maxWidth: 860, margin: '0 auto' }}>
      <div className="animate-in" style={{ marginBottom: 'var(--sp-8)' }}>
        <h1 className="font-display text-3xl tracking-tight" style={{ marginBottom: 'var(--sp-2)' }}>
          API Drift Timeline
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          History of all spec comparisons for this API.
        </p>
      </div>

      <div className="timeline-list animate-in delay-1">
        {timeline.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 'var(--sp-8)' }}>
            No comparisons found. Run a diff first.
          </div>
        ) : (
          timeline.map((item, i) => (
            <div 
              key={item.id} 
              className="timeline-item"
              onClick={() => onSelectDiff(item.id)}
              style={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--border-hairline)',
                borderRadius: 'var(--radius-card)',
                padding: 'var(--sp-4) var(--sp-6)',
                marginBottom: 'var(--sp-4)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'border-color 0.2s',
              }}
            >
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {item.api_name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {new Date(item.created_at).toLocaleString()}
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: 'var(--sp-4)' }}>
                <div className="summary-stat">
                  <span className="summary-stat-value text-breaking" style={{ fontSize: 18 }}>{item.breaking_count}</span>
                  <span className="summary-stat-label" style={{ fontSize: 10 }}>Breaking</span>
                </div>
                <div className="summary-stat">
                  <span className="summary-stat-value" style={{ fontSize: 18, color: 'var(--warning)' }}>{item.warning_count}</span>
                  <span className="summary-stat-label" style={{ fontSize: 10 }}>Warning</span>
                </div>
                <div className="summary-stat">
                  <span className="summary-stat-value text-safe" style={{ fontSize: 18 }}>{item.non_breaking_count}</span>
                  <span className="summary-stat-label" style={{ fontSize: 10 }}>Safe</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
