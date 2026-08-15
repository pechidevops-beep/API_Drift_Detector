/**
 * normalize.js
 *
 * Step 1 of the diff engine: turn a raw OpenAPI spec into a flat,
 * comparable map of { path -> metadata }.
 *
 * Why this matters: OpenAPI specs are deeply nested and can use $ref
 * pointers anywhere. You cannot diff two specs by comparing raw JSON
 * structure directly -- you first need to (a) resolve every $ref so
 * you're looking at real shapes, not pointers, and (b) flatten every
 * endpoint + schema into a single addressable key so step 2 (the diff)
 * can just compare two flat maps key by key.
 */

const SwaggerParser = require('@apidevtools/swagger-parser');

/**
 * Walks a JSON schema object recursively and emits one entry per leaf
 * field, plus one entry for each object/array node itself (so we can
 * detect added/removed nested objects, not just added/removed leaves).
 *
 * @param {object} schema - JSON schema node (already de-referenced)
 * @param {string} basePath - dotted path prefix built up during recursion
 * @param {Set<string>} requiredFromParent - required field names from parent
 * @param {object} out - accumulator map being filled in
 */
function walkSchema(schema, basePath, out) {
  if (!schema || typeof schema !== 'object') return;

  const requiredSet = new Set(schema.required || []);

  if (schema.type === 'object' && schema.properties) {
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const propPath = `${basePath}.${propName}`;

      out[propPath] = {
        type: propSchema.type || (propSchema.properties ? 'object' : 'unknown'),
        required: requiredSet.has(propName),
        enum: propSchema.enum || null,
        format: propSchema.format || null,
      };

      // Recurse into nested objects
      if (propSchema.type === 'object' && propSchema.properties) {
        walkSchema(propSchema, propPath, out);
      }

      // Recurse into array items
      if (propSchema.type === 'array' && propSchema.items) {
        out[`${propPath}[]`] = {
          type: propSchema.items.type || 'object',
          required: false,
          enum: propSchema.items.enum || null,
          format: null,
        };
        if (propSchema.items.type === 'object' && propSchema.items.properties) {
          walkSchema(propSchema.items, `${propPath}[]`, out);
        }
      }
    }
  }
}

/**
 * Flattens an entire dereferenced OpenAPI document into a single map.
 * Key format: "METHOD /path.responses.200.body.fieldName"
 *             "METHOD /path.requestBody.fieldName"
 *
 * @param {object} api - dereferenced OpenAPI document (from SwaggerParser.dereference)
 * @returns {{ endpoints: object, fields: object }}
 */
function flattenSpec(api) {
  const endpoints = {};   // tracks which endpoints exist at all
  const fields = {};      // tracks every field within every endpoint

  for (const [pathKey, pathItem] of Object.entries(api.paths || {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      const operation = pathItem[method];
      if (!operation) continue;

      const endpointKey = `${method.toUpperCase()} ${pathKey}`;
      endpoints[endpointKey] = {
        summary: operation.summary || null,
        parameters: (operation.parameters || []).map((p) => ({
          name: p.name,
          in: p.in,
          required: !!p.required,
          type: p.schema?.type || 'unknown',
        })),
      };

      // Request body fields
      const requestSchema =
        operation.requestBody?.content?.['application/json']?.schema;
      if (requestSchema) {
        walkSchema(requestSchema, `${endpointKey}.requestBody`, fields);
      }

      // Response body fields, per status code
      for (const [statusCode, responseObj] of Object.entries(
        operation.responses || {}
      )) {
        const responseSchema =
          responseObj.content?.['application/json']?.schema;
        if (responseSchema) {
          walkSchema(
            responseSchema,
            `${endpointKey}.responses.${statusCode}`,
            fields
          );
        }
      }
    }
  }

  return { endpoints, fields };
}

/**
 * Loads and fully normalizes a spec file from disk.
 * @param {string} filePath
 * @returns {Promise<{ endpoints: object, fields: object }>}
 */
async function normalizeSpecFile(filePath) {
  // SwaggerParser.dereference resolves every $ref in the document,
  // so downstream code never has to deal with pointers -- only real shapes.
  const dereferenced = await SwaggerParser.dereference(filePath);
  return flattenSpec(dereferenced);
}

module.exports = { normalizeSpecFile, flattenSpec, walkSchema };