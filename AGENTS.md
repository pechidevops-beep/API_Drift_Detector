# Agent Instructions — API Contract Drift Detector
> Mirrored as CLAUDE.md / AGENTS.md / GEMINI.md so the same rules load in any AI coding tool.

## What kind of project this is
This is a web app (Node/Express backend, React frontend, Supabase DB) — not an automation
agent that produces spreadsheets. Deliverables are code, committed to this repo and
deployed to Vercel/Render. There is no `.tmp/` cache or Google Sheets output layer.

## Reference docs (read before building, don't duplicate their content here)
- `/docs/PRD.md` — what we're building, scope, success metrics
- `/docs/TRD.md` — architecture, data model, diff engine design, rule table
- `/docs/build-order.md` — the 7-phase build order (normalize → diff → classify →
- `/docs/design.md` — UI/UX screens, layout, visual design principles
  API → frontend → AI migration guide → persistence)

This file only governs *how you work*, not *what the product does*. If you need to know
the schema, the rule table, or the UI layout, go read the docs above — don't guess, and
don't let this file drift out of sync with them by duplicating their content here.

## Non-negotiable architectural rule
Breaking-vs-non-breaking classification is deterministic code (`/backend/classify/*.js`),
never an LLM call. Claude is invoked only after classification, to explain already-flagged
changes and draft migration steps. If you find yourself about to ask Claude "is this
change breaking?" — stop, that logic belongs in a rule function, not a prompt.

## Operating principles

**1. Check for existing code first.**
Before writing new logic, check `/backend` and `/frontend` for something that already does
it. Only write new modules when nothing covers the need.

**2. Build in phase order, verify before moving on.**
Follow `/docs/build-order.md`. Don't jump to frontend work while the classification engine
is still unverified — each phase's output feeds the next, and untested upstream logic
produces confidently wrong downstream results.

**3. Self-anneal when things break.**
- Read the actual error/stack trace, don't guess
- Fix it, re-test
- If the fix reveals a gap in the rule table or schema (e.g. a change type the
  classification rules don't cover) — update `/docs/TRD.md`'s rule table, don't just
  patch around it silently
- If a fix touches paid API usage (Anthropic API calls, Supabase overages) — check with
  the user first before re-running

**4. Keep the docs living, but don't rewrite them unprompted.**
If you learn something during implementation that changes the plan (e.g. rename detection
needs a lower similarity threshold than the TRD assumed) — propose the doc update and
apply it, rather than silently building something that contradicts the written spec.
Don't overwrite PRD/TRD/build-order without flagging what changed and why.

## File organization
- `/backend` — Express API, spec parser, diff engine, classification rules
- `/frontend` — React app, Monaco diff view, upload + timeline screens
- `/docs` — PRD.md, TRD.md, build-order.md (source of truth for product + architecture)
- `.env` — Anthropic API key, Supabase credentials (never commit)
- `/backend/test-fixtures` — known-answer sample spec pairs used to verify the diff
  engine (see `spec-parser-poc` for the starting set — 8 known change types already
  covered: rename, field removed, field added required, field added optional, type
  change, enum change, endpoint removed)

## Definition of done (MVP)
See `/docs/PRD.md` §1.6. Do not mark a phase complete without running it against the
test-fixtures spec pairs and confirming the output matches expected classifications.
