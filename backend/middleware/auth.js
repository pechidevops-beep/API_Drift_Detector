/**
 * middleware/auth.js
 *
 * Verifies a Supabase JWT supplied as a Bearer token in the Authorization header.
 * Attaches the verified user object to req.user for downstream route handlers.
 *
 * Uses the SUPABASE_ANON_KEY (not service role) — this is the correct key for
 * verifying JWTs issued by Supabase Auth. The service role key is only for
 * privileged server-side database writes, not for auth verification.
 */

const { createClient } = require('@supabase/supabase-js');

// Create a separate anon-key client for JWT verification.
// This client must NOT use the service role key — it should behave as a regular
// authenticated user to properly validate session tokens.
const authClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Express middleware. Requires a valid Supabase session token.
 * On success: attaches req.user (id, email, etc.)
 * On failure: returns 401 with a clean error message (never leaks token or internals)
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated. Please log in to access this feature.' });
  }

  try {
    const { data: { user }, error } = await authClient.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    }

    req.user = user; // user.id, user.email available downstream
    next();
  } catch (err) {
    // Never leak internal error details
    console.error('[requireAuth] Token verification failed:', err.message);
    return res.status(401).json({ error: 'Authentication check failed. Please log in again.' });
  }
}

module.exports = { requireAuth };
