/**
 * routes/diff.js
 *
 * POST /api/diff
 *
 * Orchestrates the full pipeline for a single comparison request:
 *   1. Receive two uploaded spec files (v1 + v2) via multipart/form-data
 *   2. Parse + normalize each spec (resolve $refs, flatten to { endpoints, fields })
 *   3. Run structural diff (endpoints + fields)
 *   4. Classify every change (deterministic rule engine — no LLM)
 *   5. Return structured JSON to the client
 *
 * GET /api/diff/:id
 *   Stubbed — returns 501 until Supabase persistence is wired in Phase 7.
 */

const express = require('express');
const router = express.Router();
const SwaggerParser = require('@apidevtools/swagger-parser');
const { randomUUID } = require('crypto');

const { flattenSpec } = require('../normalize');
const { diffEndpoints, diffFields } = require('../diff');
const { classifyAll, summarize } = require('../classify');
const { uploadSpecPair } = require('../middleware/upload');
const supabase = require('../store/supabase');

// Optional auth: attaches req.user if a valid Bearer token is present, but
// does NOT reject unauthenticated requests. Guests can run diffs freely.
const { createClient } = require('@supabase/supabase-js');
const authClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function optionalAuth(req, _res, next) {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  if (token) {
    try {
      const { data: { user } } = await authClient.auth.getUser(token);
      if (user) req.user = user;
    } catch (_) {
      // Silently ignore bad tokens on guest-allowed routes
    }
  }
  next();
}

// ---------------------------------------------------------------------------
// Helper: parse a spec from an in-memory Buffer
// ---------------------------------------------------------------------------

/**
 * Parses a buffer containing YAML or JSON into a plain JavaScript object.
 */
function parseBufferToObject(buffer, originalName) {
  const content = buffer.toString('utf8');
  if (originalName.match(/\.json$/i)) {
    return JSON.parse(content);
  }
  const yaml = require('js-yaml');
  return yaml.load(content);
}

/**
 * Parses AND validates a spec buffer as a valid OpenAPI 3.x document.
 *
 * SECURITY FIX: Previously used SwaggerParser.dereference() which only
 * resolves $refs but does NOT validate whether the file is a valid OpenAPI
 * spec. dereference() accepts any JS object — an attacker could send a
 * crafted JSON that passes the file extension check but is not an API spec.
 * validate() does both: resolves $refs AND enforces the OpenAPI schema.
 * This means a renamed image.jpg uploaded as spec.yaml is rejected here
 * rather than producing garbage diff output or crashing downstream code.
 */
async function parseSpecBuffer(buffer, originalName) {
  const parsed = parseBufferToObject(buffer, originalName);
  // validate() throws a descriptive error if the document is not valid OpenAPI
  return SwaggerParser.validate(parsed);
}

// ---------------------------------------------------------------------------
// POST /api/diff
// ---------------------------------------------------------------------------

router.post('/', optionalAuth, uploadSpecPair, async (req, res) => {
  try {
    // --- Validate both files were uploaded ---
    const v1File = req.files?.v1?.[0];
    const v2File = req.files?.v2?.[0];

    if (!v1File || !v2File) {
      return res.status(400).json({
        error: 'Both spec files are required. Send as multipart/form-data with fields "v1" and "v2".',
      });
    }

    // SECURITY: Reject empty files explicitly.
    // An empty file passes multer's fileFilter (valid extension) but causes
    // js-yaml to return null and SwaggerParser to throw an opaque error.
    // Catching it here gives a clear 400 instead of a 500 stack trace.
    if (v1File.size === 0 || v2File.size === 0) {
      return res.status(400).json({ error: 'Uploaded file is empty. Please upload a valid OpenAPI spec.' });
    }

    // --- Parse + validate (SwaggerParser.validate enforces OpenAPI schema) ---
    const [v1Api, v2Api] = await Promise.all([
      parseSpecBuffer(v1File.buffer, v1File.originalname),
      parseSpecBuffer(v2File.buffer, v2File.originalname),
    ]);

    const v1 = flattenSpec(v1Api);
    const v2 = flattenSpec(v2Api);

    // --- Diff ---
    const endpointChanges = diffEndpoints(v1.endpoints, v2.endpoints);
    const fieldChanges    = diffFields(v1.fields, v2.fields);
    const allChanges      = [...endpointChanges, ...fieldChanges];

    // --- Classify ---
    const classified = classifyAll(allChanges);
    const counts     = summarize(classified);

    // --- Persist the result to Supabase ---
    // user_id is nullable: logged-in users get their id, guests get null.
    // Guest diffs are saved to the DB but filtered out of all Timeline queries
    // by the RLS policy: FOR ALL USING (user_id IS NULL OR auth.uid() = user_id).
    const userId = req.user?.id ?? null;

    // 1. Insert specs
    const { data: v1Data, error: errV1 } = await supabase
      .from('specs')
      .insert({
        api_name: v1File.originalname,
        version: 'v1',
        content: parseBufferToObject(v1File.buffer, v1File.originalname),
        user_id: userId,
      })
      .select('id')
      .single();

    if (errV1) throw new Error(`Supabase v1 insert failed: ${errV1.message}`);

    const { data: v2Data, error: errV2 } = await supabase
      .from('specs')
      .insert({
        api_name: v2File.originalname,
        version: 'v2',
        content: parseBufferToObject(v2File.buffer, v2File.originalname),
        user_id: userId,
      })
      .select('id')
      .single();

    if (errV2) throw new Error(`Supabase v2 insert failed: ${errV2.message}`);

    // 2. Insert diff run
    const diffId = randomUUID();
    const diffResultJson = {
      meta: {
        v1Name: v1File.originalname,
        v2Name: v2File.originalname,
        analyzedAt: new Date().toISOString(),
      },
      changes: classified,
    };

    const { error: errDiff } = await supabase
      .from('diff_runs')
      .insert({
        id: diffId,
        api_name: `${v1File.originalname} → ${v2File.originalname}`,
        spec_from_id: v1Data.id,
        spec_to_id: v2Data.id,
        diff_result: diffResultJson,
        breaking_count: counts.breaking,
        warning_count: counts.warning,
        non_breaking_count: counts.nonBreaking,
        user_id: userId,
      });

    if (errDiff) throw new Error(`Supabase diff_runs insert failed: ${errDiff.message}`);

    // Shape the response payload exactly as the frontend expects
    const result = {
      id: diffId,
      meta: diffResultJson.meta,
      summary: {
        breakingCount:    counts.breaking,
        warningCount:     counts.warning,
        nonBreakingCount: counts.nonBreaking,
        total:            counts.total,
      },
      changes: classified,
    };

    return res.status(200).json(result);
  } catch (err) {
    // SwaggerParser.validate() throws when the file is not valid OpenAPI.
    // Surface a clean user-friendly error — never forward err.message raw
    // because it may contain internal file paths or schema details.
    const isParseError = (
      err.name === 'SyntaxError' ||
      err.name === 'ParserException' ||
      err.message?.toLowerCase().includes('is not a valid openapi') ||
      err.message?.toLowerCase().includes('invalid yaml') ||
      err.message?.toLowerCase().includes('is not valid json')
    );
    if (isParseError) {
      return res.status(422).json({ error: 'Invalid or unrecognized OpenAPI spec. Upload a valid OpenAPI 3.x YAML or JSON file.' });
    }
    // Log the full error server-side (never send stack trace to client)
    console.error('[POST /api/diff] Unexpected error:', err.message);
    return res.status(500).json({ error: 'Internal server error during diff.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/diff/:id  (stubbed — Phase 7)
// ---------------------------------------------------------------------------
// GET /api/diff/:id — retrieve from Supabase
router.get('/:id', async (req, res) => {
  // SECURITY: Validate UUID format before querying the database.
  // Without this check, an attacker could pass path-traversal strings or
  // attempt to probe the DB via malformed IDs. Supabase JS client does
  // parameterize queries, but validating at the route level is defence-in-depth.
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid diff ID format.' });
  }

  try {
    const { data, error } = await supabase
      .from('diff_runs')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: `Diff '${req.params.id}' not found in database.`,
      });
    }

    // Reshape DB row to the frontend's expected format
    const result = {
      id: data.id,
      meta: data.diff_result.meta,
      summary: {
        breakingCount:    data.breaking_count,
        warningCount:     data.warning_count,
        nonBreakingCount: data.non_breaking_count,
        total:            data.breaking_count + data.warning_count + data.non_breaking_count,
      },
      changes: data.diff_result.changes,
      migrationGuide: data.migration_guide, // included if generated
    };

    return res.status(200).json(result);
  } catch (err) {
    console.error('[GET /api/diff/:id]', err);
    return res.status(500).json({ error: 'Failed to retrieve diff' });
  }
});

module.exports = router;
