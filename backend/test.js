/**
 * test.js
 *
 * Phase 3 verification harness.
 *
 * Runs the full pipeline — normalize → diff → classify — against the
 * test-fixtures/v1.yaml + v2.yaml pair and prints a human-readable report.
 *
 * Expected output (from the implementation plan):
 *
 *   user_name → userName (rename)      FIELD_RENAMED   · BREAKING
 *   age removed                        FIELD_REMOVED   · BREAKING
 *   created_at added required          FIELD_ADDED     · BREAKING
 *   avatar_url added optional          FIELD_ADDED     · NON_BREAKING
 *   status.enum gained 'pending'       ENUM_VALUE_ADDED· WARNING
 *   GET /users/{id}/posts removed      ENDPOINT_REMOVED· BREAKING
 *   password added required (req body) FIELD_ADDED     · BREAKING
 *   phone added optional (req body)    FIELD_ADDED     · NON_BREAKING
 *
 * Run with:  node test.js
 */

const path = require('path');
const { normalizeSpecFile } = require('./normalize');
const { diffEndpoints, diffFields } = require('./diff');
const { classifyAll, summarize } = require('./classify');

// ANSI colours for terminal output
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN  = '\x1b[32m';
const CYAN   = '\x1b[36m';
const DIM    = '\x1b[2m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';

function severityColor(severity) {
  if (severity === 'BREAKING')     return RED;
  if (severity === 'WARNING')      return YELLOW;
  if (severity === 'NON_BREAKING') return GREEN;
  return RESET;
}

function formatChange(c) {
  const col = severityColor(c.classification.severity);
  const key = c.type === 'FIELD_RENAMED'
    ? `${c.from}  →  ${c.to}`
    : (c.key || `${c.from} → ${c.to}`);

  return [
    `  ${col}${BOLD}[${c.classification.severity}]${RESET}`,
    `  ${CYAN}${c.type}${RESET}`,
    `  ${DIM}${key}${RESET}`,
    `  ${DIM}${c.classification.reason}${RESET}`,
  ].join('\n');
}

async function main() {
  const v1Path = path.join(__dirname, 'test-fixtures', 'v1.yaml');
  const v2Path = path.join(__dirname, 'test-fixtures', 'v2.yaml');

  console.log(`\n${BOLD}=== API Contract Drift Detector — Phase 3 Verification ===${RESET}\n`);

  console.log(`${DIM}Normalizing v1.yaml...${RESET}`);
  const v1 = await normalizeSpecFile(v1Path);

  console.log(`${DIM}Normalizing v2.yaml...${RESET}`);
  const v2 = await normalizeSpecFile(v2Path);

  // --- Diff ---
  const endpointChanges = diffEndpoints(v1.endpoints, v2.endpoints);
  const fieldChanges    = diffFields(v1.fields, v2.fields);
  const allChanges      = [...endpointChanges, ...fieldChanges];

  // --- Classify ---
  const classified = classifyAll(allChanges);
  const summary    = summarize(classified);

  // --- Print summary banner ---
  console.log(`\n${BOLD}Summary${RESET}`);
  console.log(`  ${RED}${BOLD}Breaking   ${RESET}  ${summary.breaking}`);
  console.log(`  ${YELLOW}${BOLD}Warning    ${RESET}  ${summary.warning}`);
  console.log(`  ${GREEN}${BOLD}Non-breaking${RESET} ${summary.nonBreaking}`);
  console.log(`  Total        ${summary.total}\n`);

  // --- Print each change grouped by severity ---
  const breakingChanges    = classified.filter(c => c.classification.severity === 'BREAKING');
  const warningChanges     = classified.filter(c => c.classification.severity === 'WARNING');
  const nonBreakingChanges = classified.filter(c => c.classification.severity === 'NON_BREAKING');

  if (breakingChanges.length) {
    console.log(`${RED}${BOLD}BREAKING CHANGES${RESET}`);
    breakingChanges.forEach(c => console.log(formatChange(c) + '\n'));
  }

  if (warningChanges.length) {
    console.log(`${YELLOW}${BOLD}WARNINGS${RESET}`);
    warningChanges.forEach(c => console.log(formatChange(c) + '\n'));
  }

  if (nonBreakingChanges.length) {
    console.log(`${GREEN}${BOLD}NON-BREAKING CHANGES${RESET}`);
    nonBreakingChanges.forEach(c => console.log(formatChange(c) + '\n'));
  }

  // --- Raw JSON for machine-readable inspection ---
  console.log(`${DIM}--- raw JSON (for assertion checking) ---${RESET}`);
  console.log(JSON.stringify(classified, null, 2));
}

main().catch((err) => {
  console.error('\x1b[31mError during pipeline run:\x1b[0m', err);
  process.exit(1);
});