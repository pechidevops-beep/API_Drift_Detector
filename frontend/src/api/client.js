/**
 * api/client.js
 * Thin axios wrapper — all backend calls go through here.
 *
 * Attaches the current Supabase session Bearer token to every request via
 * an axios request interceptor. Token is read fresh on each request so that
 * automatic Supabase token refresh is handled correctly without manual re-setup.
 */
import axios from 'axios';
import { supabase } from '../lib/supabase';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({ baseURL: BASE });

// ---------------------------------------------------------------------------
// Request interceptor — attach Supabase JWT if a session exists
// ---------------------------------------------------------------------------
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  return config;
});

/**
 * Upload two spec files and get back the full diff + classification result.
 * @param {File} v1File
 * @param {File} v2File
 * @returns {Promise<DiffResult>}
 */
export async function runDiff(v1File, v2File) {
  const form = new FormData();
  form.append('v1', v1File);
  form.append('v2', v2File);
  const { data } = await api.post('/api/diff', form);
  return data;
}

/**
 * Generate a Gemini migration guide for an already-saved diff.
 * Requires auth — the interceptor attaches the Bearer token automatically.
 * @param {string} diffId
 * @returns {Promise<{ guide: string }>}
 */
export async function generateMigrationGuide(diffId) {
  const { data } = await api.post(`/api/diff/${diffId}/migration-guide`);
  return data;
}

/**
 * List all diffs for the authenticated user.
 * Requires auth — the interceptor attaches the Bearer token automatically.
 * @param {string} apiName — use 'all' to fetch everything
 * @returns {Promise<Array>}
 */
export async function getTimeline(apiName) {
  const { data } = await api.get(`/api/timeline/${apiName}`);
  return data;
}

/**
 * Fetch a specific diff result by ID.
 * @param {string} id
 * @returns {Promise<DiffResult>}
 */
export async function getDiffById(id) {
  const { data } = await api.get(`/api/diff/${id}`);
  return data;
}
