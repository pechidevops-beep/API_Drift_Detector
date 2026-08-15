/**
 * classify/index.js
 *
 * Step 3 of the diff engine: take a raw change object produced by diff.js
 * and return a classification verdict.
 *
 * ARCHITECTURAL RULE (from AGENTS.md):
 *   Classification is deterministic code — never an LLM call.
 *   Claude is invoked AFTER this step, only to explain changes that this
 *   rule engine has already flagged. "Is this change breaking?" is answered
 *   here, not by a prompt.
 *
 * DESIGN PRINCIPLE — default to BREAKING on uncertainty:
 *   A false positive (flagging a safe change as breaking) costs a dev 30
 *   seconds of review. A false negative ships a production bug. When in
 *   doubt, flag it.
 *
 * FIELD_RENAMED — classified as BREAKING at any confidence level:
 *   A consumer reading the old field name gets `undefined` regardless of
 *   how certain we are it was renamed. Same observable impact as
 *   FIELD_REMOVED. We still surface it as FIELD_RENAMED (not FIELD_REMOVED)
 *   so the migration guide can say "rename X to Y" rather than "X was
 *   deleted," but the severity is identical to a removal.
 */

// ---------------------------------------------------------------------------
// Severity constants
// ---------------------------------------------------------------------------

const BREAKING = 'BREAKING';
const WARNING = 'WARNING';
const NON_BREAKING = 'NON_BREAKING';

// ---------------------------------------------------------------------------
// Classification rule table
// ---------------------------------------------------------------------------

/**
 * Classifies a single raw change object from diff.js.
 *
 * @param {object} change - A change object with at least `type` and optionally
 *   `before`, `after`, `from`, `to`, `confidence`, `addedValues`, `removedValues`.
 * @returns {{ severity: string, reason: string }}
 */
function classifyChange(change) {
  switch (change.type) {
    // -----------------------------------------------------------------------
    // Endpoint-level changes
    // -----------------------------------------------------------------------
    case 'ENDPOINT_REMOVED':
      return {
        severity: BREAKING,
        reason: 'Endpoint no longer exists — all callers will receive 404 or similar errors.',
      };

    case 'ENDPOINT_ADDED':
      return {
        severity: NON_BREAKING,
        reason: 'New endpoint — existing callers are unaffected.',
      };

    // -----------------------------------------------------------------------
    // Field existence changes
    // -----------------------------------------------------------------------
    case 'FIELD_REMOVED':
      return {
        severity: BREAKING,
        reason: 'Field no longer present in the response — any consumer reading this field will get undefined.',
      };

    case 'FIELD_ADDED':
      if (change.after?.required) {
        return {
          severity: BREAKING,
          reason: 'New required field in request body — existing clients not sending this field will receive a validation error.',
        };
      }
      return {
        severity: NON_BREAKING,
        reason: 'New optional field — existing clients can ignore it safely.',
      };

    // -----------------------------------------------------------------------
    // Rename detection
    // -----------------------------------------------------------------------
    case 'FIELD_RENAMED':
      // BREAKING at any confidence level: a consumer reading the old field
      // name gets undefined regardless of how certain we are it was renamed.
      return {
        severity: BREAKING,
        reason: `Field renamed from '${change.from?.split('.').pop()}' to '${change.to?.split('.').pop()}' (${change.confidence} confidence). Consumers reading the old name will get undefined — same impact as a removal.`,
      };

    // -----------------------------------------------------------------------
    // Type changes
    // -----------------------------------------------------------------------
    case 'TYPE_CHANGED':
      return {
        severity: BREAKING,
        reason: `Type changed from '${change.before?.type}' to '${change.after?.type}' — consumers expecting the old type will likely crash or misparse.`,
      };

    // -----------------------------------------------------------------------
    // Required-ness changes
    // -----------------------------------------------------------------------
    case 'BECAME_REQUIRED':
      return {
        severity: BREAKING,
        reason: 'Field changed from optional to required — existing clients not sending this field will now fail validation.',
      };

    case 'BECAME_OPTIONAL':
      return {
        severity: NON_BREAKING,
        reason: 'Field changed from required to optional — existing clients that always send it are unaffected.',
      };

    // -----------------------------------------------------------------------
    // Enum changes (split by diff.js into ENUM_VALUE_ADDED / ENUM_VALUE_REMOVED)
    // -----------------------------------------------------------------------
    case 'ENUM_VALUE_REMOVED':
      return {
        severity: BREAKING,
        reason: `Enum value(s) removed: [${change.removedValues?.join(', ')}]. Consumers that send or store these values will now receive a validation error or encounter unknown values.`,
      };

    case 'ENUM_VALUE_ADDED':
      return {
        severity: WARNING,
        reason: `Enum value(s) added: [${change.addedValues?.join(', ')}]. Consumers with exhaustive switch/match logic may not handle the new value — review before assuming safe.`,
      };

    // -----------------------------------------------------------------------
    // Default: unknown change type → conservative BREAKING
    // -----------------------------------------------------------------------
    default:
      return {
        severity: BREAKING,
        reason: `Unknown change type '${change.type}' — flagged as breaking by default (conservative rule).`,
      };
  }
}

/**
 * Classifies an array of changes, returning each change augmented with
 * a `classification` object ({ severity, reason }).
 *
 * @param {Array<object>} changes
 * @returns {Array<object>}
 */
function classifyAll(changes) {
  return changes.map((change) => ({
    ...change,
    classification: classifyChange(change),
  }));
}

/**
 * Returns summary counts for a classified change list.
 *
 * @param {Array<object>} classifiedChanges - Output of classifyAll()
 * @returns {{ breaking: number, warning: number, nonBreaking: number, total: number }}
 */
function summarize(classifiedChanges) {
  const counts = { breaking: 0, warning: 0, nonBreaking: 0, total: classifiedChanges.length };
  for (const c of classifiedChanges) {
    if (c.classification.severity === BREAKING) counts.breaking++;
    else if (c.classification.severity === WARNING) counts.warning++;
    else counts.nonBreaking++;
  }
  return counts;
}

module.exports = { classifyChange, classifyAll, summarize, BREAKING, WARNING, NON_BREAKING };
