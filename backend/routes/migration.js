/**
 * routes/migration.js
 *
 * POST /api/diff/:id/migration-guide
 *
 * Generates a plain-English migration guide for a previously-run diff using
 * the Google Gemini API (gemini-3.7-flash, free tier).
 *
 * SECURITY CONSTRAINTS (see TRD §2.6):
 *  1. Only accepts a diff ID that exists in the server's in-memory diff store —
 *     never accepts raw spec content or arbitrary prompt text from the client.
 *     This prevents the route from being an open Gemini API proxy.
 *  2. GEMINI_API_KEY lives only in backend/.env and is never:
 *       - sent to the frontend in any response field
 *       - logged to console (including error paths — we sanitize before logging)
 *       - included in any error message returned to the client
 *  3. Server-side rate limiter (in-memory, per-IP): max 10 calls/minute,
 *     separate from Gemini's own quota enforcement.
 *
 * RESILIENCE:
 *  - 429 responses from Gemini trigger exponential backoff (1s → 2s → 4s).
 *  - After 3 retries the client gets a friendly rate-limit message.
 *  - Any other Gemini failure returns a sanitized error — never the raw SDK error
 *    (which can contain request headers including the API key).
 */

const express = require('express');
const router  = express.Router({ mergeParams: true }); // need :id from parent
const { GoogleGenAI } = require('@google/genai');
const { requireAuth } = require('../middleware/auth');

// ---------------------------------------------------------------------------
// Supabase Client
// ---------------------------------------------------------------------------
const supabase = require('../store/supabase');

// ---------------------------------------------------------------------------
// Gemini client — instantiated once, lazily, so the server starts fine even
// if GEMINI_API_KEY is not set (key absence is caught at call time, not at boot).
// ---------------------------------------------------------------------------
let _geminiClient = null;

function getGeminiClient() {
  if (!_geminiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is not set in the environment.');
    }
    _geminiClient = new GoogleGenAI({ apiKey: key });
  }
  return _geminiClient;
}

// ---------------------------------------------------------------------------
// Server-side rate limiter (in-memory, per-IP)
// 3 migration guide generations per visitor per 15 minutes.
// Protects free-tier Gemini quota (250/day) from single-user exhaustion.
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX       = 3;

const ipCallLog = new Map(); // ip → [timestamp, ...]

function checkRateLimit(ip) {
  const now    = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const calls  = (ipCallLog.get(ip) || []).filter(t => t > cutoff);

  if (calls.length >= RATE_LIMIT_MAX) {
    const oldestCall = Math.min(...calls);
    const resetIn    = Math.ceil((oldestCall + RATE_LIMIT_WINDOW_MS - now) / 1000);
    return { limited: true, resetIn };
  }

  calls.push(now);
  ipCallLog.set(ip, calls);
  return { limited: false };
}

// Clean up old entries every 15 minutes so the Map doesn't grow unboundedly.
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [ip, calls] of ipCallLog.entries()) {
    const remaining = calls.filter(t => t > cutoff);
    if (remaining.length === 0) ipCallLog.delete(ip);
    else ipCallLog.set(ip, remaining);
  }
}, RATE_LIMIT_WINDOW_MS);

// ---------------------------------------------------------------------------
// Global daily cap (in-memory — resets on server restart, acceptable for free tier)
// Gemini free tier is ~250 requests/day; we keep headroom for testing.
// ---------------------------------------------------------------------------
let globalDailyCount = 0;
const GLOBAL_DAILY_CAP = 150;

// Reset at midnight UTC
const msUntilMidnightUTC = () => {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return midnight - now;
};
setTimeout(function resetDaily() {
  globalDailyCount = 0;
  console.log('[migration] Global daily Gemini cap reset to 0');
  setTimeout(resetDaily, 24 * 60 * 60 * 1000);
}, msUntilMidnightUTC());

// ---------------------------------------------------------------------------
// Gemini call with exponential backoff on 429
// ---------------------------------------------------------------------------

const RETRY_DELAYS = [1000, 2000, 4000]; // ms

/**
 * Builds the migration guide prompt from classified breaking changes.
 * Only BREAKING changes are included — see TRD §2.6.
 *
 * @param {Array<object>} breakingChanges
 * @returns {string}
 */
function buildPrompt(breakingChanges) {
  const changeLines = breakingChanges.map((c, i) => {
    const key = c.type === 'FIELD_RENAMED'
      ? `${c.from} → ${c.to}`
      : (c.key || c.from || 'unknown');
    return [
      `${i + 1}. Type: ${c.type}`,
      `   Path: ${key}`,
      `   Detail: ${c.classification?.reason || ''}`,
    ].join('\n');
  }).join('\n\n');

  return `You are a technical writer helping frontend developers migrate to a new API version.

The following breaking changes were detected by a deterministic rule engine (not by you).
Your job is to write a clear, concise migration guide for each one.

For each breaking change, provide:
- **What broke**: one sentence naming exactly what changed
- **Why it breaks your code**: one sentence explaining the runtime impact
- **How to fix it**: before/after code snippet (TypeScript/JavaScript, realistic variable names)

Keep each section tight — no preamble, no fluff, no repeated conclusions.
Use markdown with ## headings for each change.

---

Breaking changes detected (${breakingChanges.length}):

${changeLines}`;
}

const MODELS = ['gemini-3.7-flash', 'gemini-3.5-flash-lite'];

/**
 * Calls the Gemini API with retry on 429, and model fallback on 403/400.
 *
 * @param {string} prompt
 * @returns {Promise<string>} generated markdown text
 */
async function callGeminiWithRetry(prompt) {
  const client = getGeminiClient();

  for (const model of MODELS) {
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      try {
        const response = await client.models.generateContent({
          model,
          contents: prompt,
        });

        const text = response?.text;
        if (!text) throw new Error('Empty response from Gemini API');
        return text;

      } catch (err) {
        const isRateLimit = (
          err?.status === 429 ||
          err?.statusCode === 429 ||
          String(err?.message || '').includes('429') ||
          String(err?.message || '').toLowerCase().includes('quota') ||
          String(err?.message || '').toLowerCase().includes('rate')
        );

        if (isRateLimit && attempt < RETRY_DELAYS.length) {
          const delay = RETRY_DELAYS[attempt];
          console.log(`[migration] Gemini 429 on ${model} — retry ${attempt + 1} in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue; // retry same model
        }

        // If it's not a rate limit, or we exhausted retries, break inner loop to try next fallback model
        console.warn(`[migration] Model ${model} failed (RateLimit: ${isRateLimit}). Falling back if available.`);
        break; 
      }
    }
  }

  // If we exhaust all models and retries
  throw new Error('All Gemini models failed or rate limits exhausted.');
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

router.post('/', requireAuth, async (req, res) => {
  // 1. Server-side rate limit check
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const { limited, resetIn } = checkRateLimit(ip);
  if (limited) {
    return res.status(429).json({
      error: `Migration guide generation is rate-limited. Try again in ${resetIn} second${resetIn !== 1 ? 's' : ''}.`,
    });
  }

  // 2. Check global daily cap before making any Gemini call
  if (globalDailyCount >= GLOBAL_DAILY_CAP) {
    return res.status(429).json({
      error: 'Daily demo quota reached. The migration guide feature resets tomorrow.',
    });
  }

  // 3. Validate the diff ID is a proper UUID before hitting the database.
  // SECURITY: Without this, an attacker could pass path-traversal strings or
  // probe the Supabase API with arbitrary strings. Supabase parameterizes
  // queries, but UUID validation here is defence-in-depth and provides a
  // clear 400 rather than a cryptic Supabase error leaking schema details.
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const { id } = req.params;
  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'Invalid diff ID format.' });
  }

  // 4. Fetch the diff from Supabase (server-side trusted data).
  // The client must NOT be able to inject their own breaking-changes list
  // into the Gemini prompt — we ONLY use data we stored ourselves.
  const { data: diffRow, error: errDiff } = await supabase
    .from('diff_runs')
    .select('diff_result')
    .eq('id', id)
    .single();

  if (errDiff || !diffRow) {
    // Log Supabase error server-side, never forward raw error to client
    // (Supabase errors can reveal table names and constraint details)
    if (errDiff) console.warn('[migration] Supabase lookup error:', errDiff.message);
    return res.status(404).json({
      error: 'Diff not found. Run a comparison first.',
    });
  }

  const diffData = diffRow.diff_result;

  // 3. Extract only BREAKING changes — never pass raw client content to Gemini
  const breakingChanges = (diffData.changes || []).filter(
    c => c.classification?.severity === 'BREAKING'
  );

  if (breakingChanges.length === 0) {
    return res.status(200).json({
      guide: '## No breaking changes\n\nThis diff contains no breaking changes. No migration steps are needed.',
    });
  }

  // 4. Call Gemini
  try {
    const prompt = buildPrompt(breakingChanges);
    globalDailyCount++; // increment before call so partial failures count against cap
    const guide  = await callGeminiWithRetry(prompt);

    // SECURITY: Truncate guide to 50,000 chars before storing.
    // Prevents unbounded DB writes from a misbehaving model response.
    // Real guides rarely exceed 5,000 chars; 50k is very generous headroom.
    const guideTruncated = guide.length > 50_000
      ? guide.slice(0, 50_000) + '\n\n_[Guide truncated at 50,000 characters]_'
      : guide;


    const { error: errUpdate } = await supabase
      .from('diff_runs')
      .update({ migration_guide: guideTruncated })
      .eq('id', id);

    if (errUpdate) {
      // Log Supabase error but don't fail the request — guide was generated,
      // only persistence failed. Never forward raw Supabase error to client.
      console.warn('[migration] Guide generated but failed to save:', errUpdate.message);
    }

    return res.status(200).json({ guide: guideTruncated });

  } catch (err) {
    // SECURITY: Log only err.message, NEVER the full err object.
    // The Gemini SDK error object may contain request headers which include
    // the API key in some SDK versions. Logging the full object risks key
    // exposure in log aggregation services (Render logs, Datadog, etc.).
    console.error('[migration] Gemini call failed:', err.message);

    // Check if it's a rate-limit error from our retry logic
    if (err.isRateLimit || String(err.message).includes('rate') || String(err.message).includes('429')) {
      return res.status(429).json({
        error: 'Migration guide generation is temporarily rate-limited. Try again in a minute.',
      });
    }
    // Generic safe error — never expose internal details to the client
    return res.status(503).json({
      error: 'Migration guide generation failed. The AI service may be temporarily unavailable.',
    });
  }
});

module.exports = router;
