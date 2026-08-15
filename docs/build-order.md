3. Workflow
3.1 End-to-End User Flow
User uploads spec-v1.yaml and spec-v2.yaml (or pastes URLs to fetch them)
Backend parses + resolves both specs
Diff engine produces structural diff
Rule engine classifies each change
Result stored in Supabase, returned to frontend
Frontend renders Monaco diff view + summary panel (breaking/non-breaking counts)
User clicks "Generate Migration Guide" → async call to Claude → guide rendered below diff
Diff auto-saved to timeline under the API's name for future reference
3.2 Development Workflow (Build Order)

Recommended build order to get something demoable fastest:

Spec parsing + normalization — get two specs into comparable flat structures. No UI yet, just console output.
Structural diff (no classification yet) — added/removed/modified, dump as JSON.
Classification rule engine — apply your breaking/non-breaking table to the diff output.
Minimal API — wrap steps 1–3 in a single /api/diff endpoint.
Frontend upload + Monaco diff view — get the raw diff visually rendered.
Summary panel — breaking/non-breaking counts, color coding.
Claude migration guide integration — last, since it depends on a working classification output.
Supabase persistence + timeline view — once the core loop works end-to-end.

This order front-loads the hard, deterministic logic (parsing + classification) before touching UI or AI — so you validate the core correctness of the tool before investing in polish.
Suggested Immediate Next Step

Start with build-order step 1 (spec parsing + normalization) as a standalone Node script, no server, no UI. Test it against 2–3 real-world OpenAPI spec pairs (you can pull public examples from Stripe's or GitHub's public API specs) before writing a single line of diff logic. Getting normalization right first prevents the whole classification layer from being built on shaky data.