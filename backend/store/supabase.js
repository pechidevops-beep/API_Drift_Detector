/**
 * store/supabase.js
 *
 * Configures the Supabase client for the backend.
 * Uses the Service Role key to bypass RLS, allowing the backend to write diff
 * results even if RLS is strictly enforced on the tables.
 */

const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.warn('⚠️ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in .env. Persistence will fail.');
}

const supabase = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder');

module.exports = supabase;
