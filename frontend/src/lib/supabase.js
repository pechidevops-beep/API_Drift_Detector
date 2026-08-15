/**
 * lib/supabase.js
 *
 * Single shared Supabase client for the frontend.
 * NEVER create multiple instances — Supabase's auth state management relies on
 * a singleton to correctly synchronise sessions across components.
 *
 * Uses VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY — the anon key is safe to
 * include in the frontend bundle; it is designed for this purpose.
 * NEVER use the service role key here.
 */

import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
