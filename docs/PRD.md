1. PRD (Product Requirements Document)
1.1 Problem Statement

Teams change API contracts (OpenAPI/Swagger specs) without a reliable way to communicate impact to downstream consumers (frontend, mobile, third-party integrators). This causes silent production breakage, wasted debugging time, and trust erosion between teams. There is no lightweight tool that tells you, in plain language: "this change will break something, here's what, here's how to fix it."

1.2 Goal

Build a tool that takes two versions of an API spec and produces:

A visual diff (structural + semantic)
A classification of every change as breaking or non-breaking
A plain-English migration guide for consumers
1.3 Target Users
User	Need
Backend/API team	Verify their change doesn't silently break consumers before merging
Frontend/mobile team	Know exactly what changed and what to update
Tech lead / EM	Track API stability over time, catch risky patterns
1.4 Core User Stories
As a backend dev, I upload my old spec + new spec and instantly see what changed.
As a backend dev, I see a red/green breakdown of breaking vs non-breaking changes before I ship.
As a frontend dev, I read an auto-generated migration guide instead of reverse-engineering a diff.
As a tech lead, I view a timeline of all spec changes for a given API over time.
1.5 Scope — MVP (v1)

In scope:

Upload 2 OpenAPI 3.x spec files (YAML/JSON)
Structural diff engine (paths, methods, schemas, params, responses)
Deterministic breaking-change classification (rule-based, not LLM)
Monaco-based side-by-side diff view
Claude-generated migration guide (explanation layer only)
Save diff results to Supabase, list past comparisons

Out of scope for v1 (future):

Real consumer traffic analysis (who actually calls what)
GitHub Action / CI integration (auto-diff on PR)
Swagger 2.0 support (OpenAPI 3.x only initially)
Multi-spec / microservices aggregation view
Auth/team accounts (single-user for MVP)
1.6 Success Metrics
Correctly classifies breaking vs non-breaking for a test suite of 30+ known change patterns (target: >90% accuracy against your rule table)
Diff + classification completes in <5 seconds for a spec with ~50 endpoints
Migration guide is judged "useful without editing" in manual review for >70% of breaking changes
1.7 Risks / Open Questions
False negatives are the biggest risk — a missed breaking change defeats the tool's purpose. Rule engine must be conservative (when uncertain, flag as breaking).
Large specs (500+ endpoints) — parsing performance needs testing early.
Should migration guide generation be sync (blocks response) or async (job queue)? For MVP, sync is fine if under ~5s; revisit if specs get large.