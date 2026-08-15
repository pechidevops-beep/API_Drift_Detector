/**
 * components/ChangeList.jsx
 *
 * Compact list of classified changes with:
 *  - 3px semantic left border (breaking/warning/safe color)
 *  - mono-face field paths
 *  - filter tabs (All / Breaking / Warning / Non-Breaking)
 *  - rows stagger in by severity order on mount (breaking first)
 */
import { useState, useRef, useLayoutEffect } from 'react';

const SEVERITY_CLASS = {
  BREAKING:     'breaking',
  WARNING:      'warning',
  NON_BREAKING: 'safe',
};

const SEVERITY_LABEL = {
  BREAKING:     'Breaking',
  WARNING:      'Warning',
  NON_BREAKING: 'Non-breaking',
};

const TABS = ['All', 'Breaking', 'Warning', 'Non-breaking'];

const TAB_FILTER = {
  'All':          () => true,
  'Breaking':     c => c.classification.severity === 'BREAKING',
  'Warning':      c => c.classification.severity === 'WARNING',
  'Non-breaking': c => c.classification.severity === 'NON_BREAKING',
};

function changeKey(c) {
  if (c.type === 'FIELD_RENAMED') return `${c.from} → ${c.to}`;
  return c.key || c.from || '';
}

function changeLabel(c) {
  // Shorten the key to just the meaningful tail for compact display
  const key = changeKey(c);
  if (c.type === 'FIELD_RENAMED') {
    const fromParts = c.from?.split('.');
    const toParts   = c.to?.split('.');
    const context   = fromParts?.slice(0, 2).join(' ') || '';
    const fromField = fromParts?.slice(-1)[0] || '';
    const toField   = toParts?.slice(-1)[0] || '';
    return { context, main: `${fromField} → ${toField}` };
  }
  const parts = key.split('.');
  const context = parts.slice(0, 2).join(' ');
  const field   = parts.slice(2).join('.');
  return { context, main: field || context };
}

export default function ChangeList({ changes = [] }) {
  const [activeTab, setActiveTab] = useState('All');
  const tabsRef   = useRef(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  // Sort: breaking first, then warning, then safe (for the severity-ordered reveal)
  const severityOrder = { BREAKING: 0, WARNING: 1, NON_BREAKING: 2 };
  const sorted = [...changes].sort(
    (a, b) => severityOrder[a.classification.severity] - severityOrder[b.classification.severity]
  );

  const filtered = sorted.filter(TAB_FILTER[activeTab]);

  // Slide the tab indicator
  useLayoutEffect(() => {
    if (!tabsRef.current) return;
    const activeEl = tabsRef.current.querySelector('.filter-tab.active');
    if (!activeEl) return;
    const parentRect  = tabsRef.current.getBoundingClientRect();
    const tabRect     = activeEl.getBoundingClientRect();
    setIndicator({ left: tabRect.left - parentRect.left, width: tabRect.width });
  }, [activeTab]);

  return (
    <div>
      {/* Filter tabs */}
      <div ref={tabsRef} className="filter-tabs" style={{ marginBottom: '0' }}>
        {TABS.map(tab => (
          <button
            key={tab}
            className={`filter-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
            {tab !== 'All' && (
              <span style={{
                marginLeft: 6,
                fontSize: 10,
                opacity: 0.6,
                fontFamily: 'var(--font-mono)',
              }}>
                {sorted.filter(TAB_FILTER[tab]).length}
              </span>
            )}
          </button>
        ))}
        <span
          className="filter-tab-indicator"
          style={{ left: indicator.left, width: indicator.width }}
        />
      </div>

      {/* Change rows */}
      <div className="change-list" style={{ borderTop: 'none', borderRadius: '0 0 6px 6px' }}>
        {filtered.length === 0 && (
          <div style={{
            padding: 'var(--sp-8)',
            textAlign: 'center',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
          }}>
            No {activeTab.toLowerCase()} changes
          </div>
        )}
        {filtered.map((c, i) => {
          const sev   = c.classification.severity;
          const cls   = SEVERITY_CLASS[sev] || 'safe';
          const label = changeLabel(c);
          const delay = `${i * 30}ms`;

          return (
            <div
              key={i}
              className={`change-row ${cls} animate-in`}
              style={{ animationDelay: delay }}
            >
              <span className={`badge badge-${cls}`}>
                {sev === 'NON_BREAKING' ? 'Safe' : SEVERITY_LABEL[sev]}
              </span>

              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text-secondary)',
                minWidth: 120,
                flexShrink: 0,
              }}>
                {c.type}
              </span>

              <span className="change-row-key" title={changeKey(c)}>
                <span style={{ color: 'var(--text-secondary)', marginRight: 4 }}>
                  {label.context}
                </span>
                {label.main && (
                  <span style={{ color: 'var(--text-primary)' }}>
                    {label.context ? '· ' : ''}{label.main}
                  </span>
                )}
              </span>

              <span className="change-row-reason" title={c.classification.reason}>
                {c.classification.reason}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
