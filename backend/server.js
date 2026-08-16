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
 *
 * Security hardening applied:
 *   - helmet()     : Sets 12 HTTP security headers (CSP, HSTS, X-Frame-Options, etc.)
 *   - cors()       : Scoped to FRONTEND_URL, credentials only on that origin
 *   - rateLimit()  : Loose 100 req/15min general DoS protection on all routes
 *   - trust proxy  : Required for Render to pass real visitor IPs to req.ip
 *   - Error handler: NODE_ENV=production hides err.message; only logs server-side
 */

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');

const diffRouter      = require('./routes/diff');
const migrationRouter = require('./routes/migration');
const { requireAuth } = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 3001;

const supabase = require('./store/supabase');

// ---------------------------------------------------------------------------
// Trust proxy — MUST be the FIRST setting, before any middleware.
// Required for Render's reverse proxy to pass real visitor IPs through to
// req.ip. Without this, rate limiting sees one internal proxy IP for every
// visitor and fails silently — everyone shares one quota bucket.
// ---------------------------------------------------------------------------
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Helmet — sets 12 HTTP security headers automatically:
//   - Strict-Transport-Security (HSTS)
//   - X-Content-Type-Options: nosniff (prevents MIME sniffing)
//   - X-Frame-Options: SAMEORIGIN (clickjacking protection)
//   - X-XSS-Protection (legacy browsers)
//   - Referrer-Policy
//   - Permissions-Policy
// These are free one-line protections — omitting them is a deployment risk.
// ---------------------------------------------------------------------------
app.use(helmet());

// ---------------------------------------------------------------------------
// CORS — scoped to our frontend URL only.
// credentials: true is required for the Authorization header to be sent
// cross-origin. allowedHeaders is explicit to prevent CORS wildcards.
// ---------------------------------------------------------------------------
const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5175';
app.use(cors({
  origin: allowedOrigin,
  credentials: true,
  methods: ['GET', 'POST'],
  // Explicit allowedHeaders prevents CORS from accepting arbitrary headers
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ---------------------------------------------------------------------------
// General rate limiter — loose DoS protection on ALL routes.
// The migration-guide route has a tighter per-route limiter (3/15min) that
// overrides this for Gemini calls. This catches brute-force scanning and
// general abuse without affecting normal users (100 req/15min is generous).
// ---------------------------------------------------------------------------
const generalLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,    // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again later.' },
  // keyGenerator uses req.ip which is correct because trust proxy is set above
});
app.use(generalLimit);

// JSON body parser (for non-multipart routes like migration guide trigger)
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use('/api/diff', diffRouter);

// Migration guide route — must be registered separately with :id param
// (Express needs the full path to distinguish from GET /api/diff/:id)
app.use('/api/diff/:id/migration-guide', migrationRouter);

// Timeline — auth required, returns ONLY the authenticated user's diffs.
// user_id filter is applied BOTH here (defence-in-depth) and at the DB
// layer via RLS policy. One layer alone is not sufficient.
app.get('/api/timeline/:apiName', requireAuth, async (req, res) => {
  try {
    let query = supabase
      .from('diff_runs')
      .select('id, api_name, breaking_count, warning_count, non_breaking_count, created_at')
      // Explicit user_id filter — defence-in-depth on top of RLS.
      // RLS is the safety net; this is the first line of defence.
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (req.params.apiName !== 'all') {
      query = query.eq('api_name', req.params.apiName);
    }

    const { data, error } = await query;

    if (error) {
      if (error.code === 'PGRST205') {
        // Table not found — user hasn't run the DB migration SQL yet
        console.warn('[Timeline] Table diff_runs not found (PGRST205). Returning empty timeline.');
        return res.status(200).json([]);
      }
      // Log full Supabase error server-side, but NEVER send raw error to client
      // (Supabase errors can reveal table names, column names, constraint details)
      console.error('[Timeline] Supabase error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch timeline.' });
    }

    res.status(200).json(data);
  } catch (err) {
    console.error('[Timeline Exception]', err.message);
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
// Global error handler — MUST be the last middleware (4 params = error handler)
//
// Security: In production, err.message is NOT forwarded to the client.
// err.message can contain: file paths, DB schema details, key fragments, and
// internal variable names that aid attackers. Only show it in local dev.
// Full error (including stack) is always logged server-side for debugging.
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  // Always log the full error server-side (stack + message)
  console.error('[Unhandled error]', err.stack || err.message);

  // In production: generic message — never expose internals to the client
  // In development: show the real message for faster debugging
  const clientMessage = process.env.NODE_ENV === 'production'
    ? 'Something went wrong. Please try again.'
    : (err.message || 'Internal server error');

  res.status(err.status || 500).json({ error: clientMessage });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`API Drift Detector backend listening on http://localhost:${PORT}`);
  console.log(`  POST /api/diff                     — compare two specs`);
  console.log(`  GET  /health                       — health check`);
});

module.exports = app;
