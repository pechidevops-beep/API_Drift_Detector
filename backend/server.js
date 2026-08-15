/**
 * server.js
 *
 * Express entry point for the API Contract Drift Detector backend.
 *
 * Routes:
 *   POST /api/diff                     — upload two specs, get diff + classification (guest OK)
 *   GET  /api/diff/:id                 — retrieve a saved diff (guest OK)
 *   POST /api/diff/:id/migration-guide — generate Gemini migration guide (auth required)
 *   GET  /api/timeline/:apiName        — list historical diffs (auth required)
 */

require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const diffRouter      = require('./routes/diff');
const migrationRouter = require('./routes/migration');
const { requireAuth } = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 3001;

const supabase = require('./store/supabase');

// ---------------------------------------------------------------------------
// Trust proxy — MUST be first, before any middleware.
// Required for Render's reverse proxy to pass real visitor IPs through to
// req.ip. Without this, rate limiting sees the same internal proxy IP for
// every visitor and fails silently.
// ---------------------------------------------------------------------------
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5175';
app.use(cors({
  origin: allowedOrigin,
  credentials: true,
  methods: ['GET', 'POST'],
}));

// JSON body parser (for non-multipart routes like migration guide trigger)
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use('/api/diff', diffRouter);

// Migration guide route — must be registered separately with :id param
// (Express needs the full path to distinguish from GET /api/diff/:id)
app.use('/api/diff/:id/migration-guide', migrationRouter);

// Timeline — auth required, returns only the authenticated user's diffs
app.get('/api/timeline/:apiName', requireAuth, async (req, res) => {
  try {
    let query = supabase
      .from('diff_runs')
      .select('id, api_name, breaking_count, warning_count, non_breaking_count, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (req.params.apiName !== 'all') {
      query = query.eq('api_name', req.params.apiName);
    }

    const { data, error } = await query;

    if (error) {
      if (error.code === 'PGRST205') {
        // Table doesn't exist yet (Supabase schema cache hasn't updated or user hasn't run the SQL script)
        console.warn('[Timeline] Table diff_runs not found (PGRST205). Returning empty timeline.');
        return res.status(200).json([]);
      }
      console.error('[Timeline]', error.message);
      return res.status(500).json({ error: 'Failed to fetch timeline.' });
    }

    res.status(200).json(data);
  } catch (err) {
    console.error('[Timeline Exception]', err);
    res.status(500).json({ error: 'Internal server error fetching timeline.' });
  }
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------

// Must have 4 params for Express to treat it as an error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Unhandled error]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`API Drift Detector backend listening on http://localhost:${PORT}`);
  console.log(`  POST /api/diff                     — compare two specs`);
  console.log(`  GET  /health                       — health check`);
});

module.exports = app; // exported for future testing
