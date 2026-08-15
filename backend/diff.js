/**
 * diff.js
 *
 * Step 2 of the diff engine: compare two normalized flat maps and produce
 * a list of raw changes (no classification yet — that's classify/index.js).
 *
 * Exported functions are pure: they take data in, return data out, with no
 * file I/O or side effects, so they are easy to unit-test and easy to call
 * from either the CLI test harness or the Express route handler.
 */

// ---------------------------------------------------------------------------
// Rename detection helpers
// ---------------------------------------------------------------------------

/**
 * Levenshtein distance between two strings.
 * Used to identify likely renames: if a field disappeared and a differently-
 * named field appeared in the same schema node with the same type + required-
 * ness, and the names are close, we surface it as a rename rather than an
 * independent add + remove pair.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Returns true if two flat-map keys share the same parent schema path.
 * e.g. "GET /users/{id}.responses.200.user_name" and
 *      "GET /users/{id}.responses.200.userName" share the same parent.
 *
 * @param {string} keyA
 * @param {string} keyB
 * @returns {boolean}
 */
function sameParent(keyA, keyB) {
  return (
    keyA.slice(0, keyA.lastIndexOf('.')) ===
    keyB.slice(0, keyB.lastIndexOf('.'))
  );
}

/**
 * Given a list of raw-removed and raw-added field changes, tries to pair
 * them into FIELD_RENAMED changes using Levenshtein similarity on the final
 * field name segment. Pairs are consumed greedily (closest name first).
 *
 * Rename confidence:
 *   - distance <= 2  → 'high'
 *   - distance 3–4   → 'medium'
 *
 * Thresholds are deliberately conservative — if names are too different we
 * leave them as independent FIELD_REMOVED + FIELD_ADDED rather than guess.
 *
 * @param {Array<{key: string, before: object}>} removed
 * @param {Array<{key: string, after: object}>} added
 * @returns {Array<object>} rename change objects
 */
function detectRenames(removed, added) {
  const renames = [];
  const usedAdded = new Set();

  for (const r of removed) {
    let bestMatch = null;
    let bestDistance = Infinity;

    for (const a of added) {
      if (usedAdded.has(a.key)) continue;
      if (!sameParent(r.key, a.key)) continue;
      // Must share the same type and required-ness to be a plausible rename.
      if (r.before.type !== a.after.type) continue;
      if (r.before.required !== a.after.required) continue;

      const rName = r.key.split('.').pop();
      const aName = a.key.split('.').pop();
      const distance = levenshtein(rName.toLowerCase(), aName.toLowerCase());

      if (distance <= 4 && distance < bestDistance) {
        bestDistance = distance;
        bestMatch = a;
      }
    }

    if (bestMatch) {
      usedAdded.add(bestMatch.key);
      renames.push({
        type: 'FIELD_RENAMED',
        from: r.key,
        to: bestMatch.key,
        before: r.before,
        after: bestMatch.after,
        confidence: bestDistance <= 2 ? 'high' : 'medium',
      });
    }
  }

  return renames;
}

// ---------------------------------------------------------------------------
// Core diff functions
// ---------------------------------------------------------------------------

/**
 * Diffs two flat endpoint maps (the `endpoints` part of a normalized spec).
 * Only reports ENDPOINT_REMOVED and ENDPOINT_ADDED — parameter-level changes
 * are covered by the field diff because parameters are included in the fields
 * map via the normalizer.
 *
 * @param {object} oldEndpoints
 * @param {object} newEndpoints
 * @returns {Array<object>} endpoint change objects
 */
function diffEndpoints(oldEndpoints, newEndpoints) {
  const allKeys = new Set([
    ...Object.keys(oldEndpoints),
    ...Object.keys(newEndpoints),
  ]);
  const changes = [];

  for (const key of allKeys) {
    if (oldEndpoints[key] && !newEndpoints[key]) {
      changes.push({ key, type: 'ENDPOINT_REMOVED' });
    } else if (!oldEndpoints[key] && newEndpoints[key]) {
      changes.push({ key, type: 'ENDPOINT_ADDED' });
    }
  }

  return changes;
}

/**
 * Diffs two flat field maps (the `fields` part of a normalized spec).
 * Detects: FIELD_REMOVED, FIELD_ADDED, TYPE_CHANGED, BECAME_REQUIRED,
 * BECAME_OPTIONAL, ENUM_CHANGED, FIELD_RENAMED (via rename detection).
 *
 * Rename detection runs after independent add/remove are found: any
 * removed/added pair that looks like a rename is collapsed into a single
 * FIELD_RENAMED change rather than being reported as two separate events.
 *
 * @param {object} oldFields
 * @param {object} newFields
 * @returns {Array<object>} field change objects
 */
function diffFields(oldFields, newFields) {
  const allKeys = new Set([
    ...Object.keys(oldFields),
    ...Object.keys(newFields),
  ]);
  const rawRemoved = [];
  const rawAdded = [];
  const changes = [];

  for (const key of allKeys) {
    const before = oldFields[key];
    const after = newFields[key];

    if (before && !after) {
      rawRemoved.push({ key, before });
    } else if (!before && after) {
      rawAdded.push({ key, after });
    } else if (before.type !== after.type) {
      changes.push({ key, type: 'TYPE_CHANGED', before, after });
    } else if (before.required !== after.required) {
      changes.push({
        key,
        type: after.required ? 'BECAME_REQUIRED' : 'BECAME_OPTIONAL',
        before,
        after,
      });
    } else if (JSON.stringify(before.enum) !== JSON.stringify(after.enum)) {
      // Distinguish between enum values being added vs removed — they have
      // different severity (WARNING vs BREAKING) so we need to split them
      // into separate sub-changes rather than one opaque ENUM_CHANGED.
      const oldEnums = new Set(before.enum || []);
      const newEnums = new Set(after.enum || []);
      const added = [...newEnums].filter((v) => !oldEnums.has(v));
      const removed = [...oldEnums].filter((v) => !newEnums.has(v));

      if (removed.length > 0) {
        changes.push({
          key,
          type: 'ENUM_VALUE_REMOVED',
          removedValues: removed,
          before,
          after,
        });
      }
      if (added.length > 0) {
        changes.push({
          key,
          type: 'ENUM_VALUE_ADDED',
          addedValues: added,
          before,
          after,
        });
      }
    }
  }

  // Reconcile raw removed/added pairs into renames where possible.
  const renames = detectRenames(rawRemoved, rawAdded);
  const renamedFromKeys = new Set(renames.map((r) => r.from));
  const renamedToKeys = new Set(renames.map((r) => r.to));

  changes.push(...renames);

  for (const r of rawRemoved) {
    if (!renamedFromKeys.has(r.key)) {
      changes.push({ key: r.key, type: 'FIELD_REMOVED', before: r.before });
    }
  }
  for (const a of rawAdded) {
    if (!renamedToKeys.has(a.key)) {
      changes.push({ key: a.key, type: 'FIELD_ADDED', after: a.after });
    }
  }

  return changes;
}

module.exports = { diffEndpoints, diffFields, detectRenames, levenshtein };
