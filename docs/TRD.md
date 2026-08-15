2. TRD (Technical Requirements Document)
2.1 Stack
Layer	Tech	Why
Frontend	React + Monaco Editor	Monaco gives you a battle-tested diff UI for free
Backend	Node.js + Express	Simple REST API, good YAML/JSON tooling ecosystem
Spec parsing	@apidevtools/swagger-parser (or similar)	Resolves $refs, validates spec structure before you diff it
Semantic diff	Custom engine (see 2.3)	No mature open-source lib does breaking-change classification well enough — this is your core IP
AI layer	Google Gemini API (@google/genai SDK, model: gemini-3.7-flash)	Migration guide generation only — not classification. Free tier (no credit card required), ongoing quota. gemini-2.5-flash was deprecated July 2026; 3.7-flash is the current stable free-tier model.
Database	Supabase (Postgres)	Store spec versions, diff results, timeline
Hosting	Vercel (frontend) + Render (backend) — matches your existing PipeHeal setup	Consistency with tools you already know
2.2 System Architecture
┌─────────────┐      ┌──────────────┐      ┌───────────────────┐
│   React UI   │─────▶│  Express API  │─────▶│  Spec Parser       │
│ (Monaco diff)│◀─────│              │      │ (resolve $refs)    │
└─────────────┘      └──────┬───────┘      └────────┬───────────┘
                             │                        │
                             ▼                        ▼
                     ┌───────────────┐      ┌───────────────────┐
                     │ Supabase       │      │ Diff Engine        │
                     │ (spec history, │◀─────│ (structural diff)  │
                     │  diff results) │      └────────┬───────────┘
                     └───────────────┘                │
                                                        ▼
                                              ┌───────────────────┐
                                              │ Classification      │
                                              │ Rule Engine          │
                                              │ (breaking/non-break) │
                                              └────────┬───────────┘
                                                        │
                                                        ▼
                                              ┌───────────────────┐
                                              │ Claude API           │
                                              │ (migration guide,    │
                                              │  plain-English expl) │
                                              └───────────────────┘

Key architectural decision: Classification is deterministic code, not an LLM call. Claude is invoked after classification, only to explain and generate migration steps for changes the rule engine already flagged. This keeps the core correctness guarantee out of the LLM's hands.

2.3 Diff Engine Design (the hard part)

Step 1 — Normalize both specs

Resolve all $ref pointers so you're comparing fully expanded schemas, not references
Produce a flat map: { "GET /users/{id}.responses.200.schema.properties.user_name": { type: "string", required: false } }

Step 2 — Structural diff

Compare flat maps key-by-key
Categories: added, removed, modified, unchanged

Step 3 — Rename detection (critical, non-trivial) Naive diffing sees a rename as "field removed + field added," which is misleading. Detect renames by comparing sibling fields in the same schema node using similarity heuristics:

Same type + same position in schema + high string similarity (e.g., Levenshtein distance) between old/new key names → flag as likely rename, not independent add/remove
Surface both interpretations to the user if confidence is low — don't silently guess

Step 4 — Classification rule table Encode as pure functions, one per change type. Example logic (not exhaustive):

js
function classifyFieldChange(change) {
  if (change.type === 'field_removed') return 'BREAKING';
  if (change.type === 'field_added' && change.required) return 'BREAKING';
  if (change.type === 'field_added' && !change.required) return 'NON_BREAKING';
  if (change.type === 'type_changed') return 'BREAKING';
  if (change.type === 'required_to_optional') return 'NON_BREAKING';
  if (change.type === 'optional_to_required') return 'BREAKING';
  if (change.type === 'endpoint_removed') return 'BREAKING';
  if (change.type === 'enum_value_added') return 'WARNING'; // context-dependent
  if (change.type === 'enum_value_removed') return 'BREAKING';
  // Renames are BREAKING at any confidence level: a consumer reading the old
  // field name gets undefined regardless of how certain we are it was renamed.
  // Same observable impact as FIELD_REMOVED. Surfaced as FIELD_RENAMED (not
  // FIELD_REMOVED) so the migration guide can say "rename X to Y" rather than
  // "X was deleted," but the severity is identical.
  if (change.type === 'field_renamed') return 'BREAKING';
  // default: uncertain changes are BREAKING, not NON_BREAKING
  return 'BREAKING';
}

Design principle: default-to-breaking on uncertainty. A false positive (flagging something safe as breaking) costs a dev 30 seconds of review. A false negative ships a production bug.

2.4 API Endpoints (Express)
Method	Route	Purpose
POST	/api/specs/upload	Upload spec file, store in Supabase
POST	/api/diff	Accepts two spec IDs (or files), returns diff + classification
POST	/api/diff/:id/migration-guide	Triggers Claude call for migration guide on a saved diff
GET	/api/diff/:id	Retrieve a saved diff result
GET	/api/timeline/:apiName	List all diffs for a given API over time
2.5 Data Model (Supabase / Postgres)
sql
specs (
  id uuid primary key,
  api_name text,
  version_label text,
  raw_content jsonb,
  uploaded_at timestamp
)

diffs (
  id uuid primary key,
  spec_from_id uuid references specs(id),
  spec_to_id uuid references specs(id),
  diff_result jsonb,        -- structural diff + classifications
  breaking_count int,
  non_breaking_count int,
  migration_guide text,      -- nullable until generated
  created_at timestamp
)
2.6 Gemini Prompt Strategy (Migration Guide)

Model: gemini-3.7-flash via @google/genai SDK v2.x. API key stored in backend/.env as
GEMINI_API_KEY — never exposed to the frontend or logged.

Feed Gemini only the already-classified BREAKING changes (not raw spec dumps) to keep
tokens low and keep the LLM out of the classification decision:

Given these breaking API changes: [structured list of change objects],
write a migration guide for frontend developers. For each change:
- What broke
- Why it breaks their code
- The exact code change needed (before/after)
Keep it concise, no fluff, code examples only where needed.

Rate-limit handling:
- Server-side in-memory limiter: max 10 requests/minute/IP on this route (protects free-tier quota)
- SDK-level 429 retry: exponential backoff 1s → 2s → 4s before surfacing a user-friendly error
- On all failures: return a clean error message to the client, never the raw SDK error or headers
  (which could contain the API key in stringified form)

Security constraint: POST /api/diff/:id/migration-guide only accepts a diff ID that already
exists in the server's in-memory diff store — it never accepts raw spec content or arbitrary
prompt text from the client. This prevents the route being used as an open Gemini proxy.