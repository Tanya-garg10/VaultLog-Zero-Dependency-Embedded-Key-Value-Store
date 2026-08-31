// src/schema/validator.mjs
// PACKAGE KILLER: Zero-Dependency JSON Schema (Draft-07 subset) Validator & Type Checker.
// Completely replaces AJV, Zod, and Joi using only standard JavaScript primitives.

const FORMAT_VALIDATORS = {
  'email': (val) => typeof val === 'string' && /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(val),
  'uuid': (val) => typeof val === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(val),
  'uri': (val) => {
    if (typeof val !== 'string') return false;
    try {
      new URL(val);
      return true;
    } catch {
      return false;
    }
  },
  'ipv4': (val) => {
    if (typeof val !== 'string') return false;
    const parts = val.split('.');
    if (parts.length !== 4) return false;
    return parts.every(part => {
      const num = Number(part);
      return /^\d+$/.test(part) && num >= 0 && num <= 255 && (part === '0' || !part.startsWith('0'));
    });
  },
  'date': (val) => typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val) && !isNaN(Date.parse(val)),
  'date-time': (val) => typeof val === 'string' && !isNaN(Date.parse(val)),
  'hostname': (val) => typeof val === 'string' && /^([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])(\.([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9]))*$/.test(val)
};

/**
 * Validates a value against a JSON Schema.
 * @param {any} data 
 * @param {object} schema 
 * @param {string} currentPath 
 * @returns {{ valid: boolean, errors: Array<{ path: string, message: string, keyword: string, schemaValue: any, actualValue: any }> }}
 */
export function validateSchema(data, schema, currentPath = '#') {
  const errors = [];

  if (schema === true) return { valid: true, errors: [] };
  if (schema === false) {
    return {
      valid: false,
      errors: [{ path: currentPath, message: 'Schema is false (matches nothing)', keyword: 'false', schemaValue: false, actualValue: data }]
    };
  }
  if (!schema || typeof schema !== 'object') {
    return { valid: true, errors: [] };
  }

  // 1. Type validation
  if (schema.type) {
    const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actualType = getTypeName(data);
    const matchesType = expectedTypes.some(t => {
      if (t === 'integer') return actualType === 'number' && Number.isInteger(data);
      if (t === 'number') return actualType === 'number';
      return actualType === t;
    });

    if (!matchesType) {
      errors.push({
        path: currentPath,
        message: `Expected type "${expectedTypes.join(' | ')}", but received "${actualType}"`,
        keyword: 'type',
        schemaValue: schema.type,
        actualValue: data
      });
      // Skip further property/item checks if root type mismatches
      return { valid: errors.length === 0, errors };
    }
  }

  // 2. Const & Enum
  if (schema.const !== undefined) {
    if (!deepEqual(data, schema.const)) {
      errors.push({
        path: currentPath,
        message: `Value must equal const ${JSON.stringify(schema.const)}`,
        keyword: 'const',
        schemaValue: schema.const,
        actualValue: data
      });
    }
  }

  if (Array.isArray(schema.enum)) {
    const matched = schema.enum.some(e => deepEqual(data, e));
    if (!matched) {
      errors.push({
        path: currentPath,
        message: `Value must be one of [${schema.enum.map(x => JSON.stringify(x)).join(', ')}]`,
        keyword: 'enum',
        schemaValue: schema.enum,
        actualValue: data
      });
    }
  }

  // 3. String validations
  if (typeof data === 'string') {
    if (typeof schema.minLength === 'number' && data.length < schema.minLength) {
      errors.push({
        path: currentPath,
        message: `String length (${data.length}) is shorter than minimum allowed (${schema.minLength})`,
        keyword: 'minLength',
        schemaValue: schema.minLength,
        actualValue: data.length
      });
    }
    if (typeof schema.maxLength === 'number' && data.length > schema.maxLength) {
      errors.push({
        path: currentPath,
        message: `String length (${data.length}) exceeds maximum allowed (${schema.maxLength})`,
        keyword: 'maxLength',
        schemaValue: schema.maxLength,
        actualValue: data.length
      });
    }
    if (schema.pattern) {
      try {
        const reg = new RegExp(schema.pattern);
        if (!reg.test(data)) {
          errors.push({
            path: currentPath,
            message: `String does not match required regex pattern: /${schema.pattern}/`,
            keyword: 'pattern',
            schemaValue: schema.pattern,
            actualValue: data
          });
        }
      } catch (e) {
        errors.push({
          path: currentPath,
          message: `Invalid regex pattern in schema: ${e.message}`,
          keyword: 'pattern',
          schemaValue: schema.pattern,
          actualValue: data
        });
      }
    }
    if (schema.format && FORMAT_VALIDATORS[schema.format]) {
      if (!FORMAT_VALIDATORS[schema.format](data)) {
        errors.push({
          path: currentPath,
          message: `String does not conform to format "${schema.format}"`,
          keyword: 'format',
          schemaValue: schema.format,
          actualValue: data
        });
      }
    }
  }

  // 4. Number validations
  if (typeof data === 'number') {
    if (typeof schema.minimum === 'number' && data < schema.minimum) {
      errors.push({
        path: currentPath,
        message: `Value (${data}) is less than minimum (${schema.minimum})`,
        keyword: 'minimum',
        schemaValue: schema.minimum,
        actualValue: data
      });
    }
    if (typeof schema.maximum === 'number' && data > schema.maximum) {
      errors.push({
        path: currentPath,
        message: `Value (${data}) is greater than maximum (${schema.maximum})`,
        keyword: 'maximum',
        schemaValue: schema.maximum,
        actualValue: data
      });
    }
    if (typeof schema.exclusiveMinimum === 'number' && data <= schema.exclusiveMinimum) {
      errors.push({
        path: currentPath,
        message: `Value (${data}) must be strictly greater than ${schema.exclusiveMinimum}`,
        keyword: 'exclusiveMinimum',
        schemaValue: schema.exclusiveMinimum,
        actualValue: data
      });
    }
    if (typeof schema.exclusiveMaximum === 'number' && data >= schema.exclusiveMaximum) {
      errors.push({
        path: currentPath,
        message: `Value (${data}) must be strictly less than ${schema.exclusiveMaximum}`,
        keyword: 'exclusiveMaximum',
        schemaValue: schema.exclusiveMaximum,
        actualValue: data
      });
    }
    if (typeof schema.multipleOf === 'number' && schema.multipleOf > 0) {
      const remainder = Math.abs(data % schema.multipleOf);
      if (remainder > 1e-9 && Math.abs(remainder - schema.multipleOf) > 1e-9) {
        errors.push({
          path: currentPath,
          message: `Value (${data}) is not a multiple of ${schema.multipleOf}`,
          keyword: 'multipleOf',
          schemaValue: schema.multipleOf,
          actualValue: data
        });
      }
    }
  }

  // 5. Object validations
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    if (Array.isArray(schema.required)) {
      for (const reqKey of schema.required) {
        if (data[reqKey] === undefined) {
          errors.push({
            path: currentPath === '#' ? `#/${reqKey}` : `${currentPath}/${reqKey}`,
            message: `Missing required property "${reqKey}"`,
            keyword: 'required',
            schemaValue: reqKey,
            actualValue: undefined
          });
        }
      }
    }

    if (typeof schema.minProperties === 'number' && Object.keys(data).length < schema.minProperties) {
      errors.push({
        path: currentPath,
        message: `Object has fewer properties (${Object.keys(data).length}) than minimum required (${schema.minProperties})`,
        keyword: 'minProperties',
        schemaValue: schema.minProperties,
        actualValue: Object.keys(data).length
      });
    }

    if (typeof schema.maxProperties === 'number' && Object.keys(data).length > schema.maxProperties) {
      errors.push({
        path: currentPath,
        message: `Object has more properties (${Object.keys(data).length}) than maximum allowed (${schema.maxProperties})`,
        keyword: 'maxProperties',
        schemaValue: schema.maxProperties,
        actualValue: Object.keys(data).length
      });
    }

    const properties = schema.properties || {};
    const patternProperties = schema.patternProperties || {};
    const additionalProperties = schema.additionalProperties;

    for (const [key, val] of Object.entries(data)) {
      const propPath = currentPath === '#' ? `#/${key}` : `${currentPath}/${key}`;
      let matchedByProperty = false;
      let matchedByPattern = false;

      if (properties[key]) {
        matchedByProperty = true;
        const sub = validateSchema(val, properties[key], propPath);
        errors.push(...sub.errors);
      }

      for (const [pattern, patSchema] of Object.entries(patternProperties)) {
        try {
          if (new RegExp(pattern).test(key)) {
            matchedByPattern = true;
            const sub = validateSchema(val, patSchema, propPath);
            errors.push(...sub.errors);
          }
        } catch {
          // ignore invalid pattern regex
        }
      }

      if (!matchedByProperty && !matchedByPattern) {
        if (additionalProperties === false) {
          errors.push({
            path: propPath,
            message: `Property "${key}" is not permitted by additionalProperties: false`,
            keyword: 'additionalProperties',
            schemaValue: false,
            actualValue: key
          });
        } else if (additionalProperties && typeof additionalProperties === 'object') {
          const sub = validateSchema(val, additionalProperties, propPath);
          errors.push(...sub.errors);
        }
      }
    }
  }

  // 6. Array validations
  if (Array.isArray(data)) {
    if (typeof schema.minItems === 'number' && data.length < schema.minItems) {
      errors.push({
        path: currentPath,
        message: `Array length (${data.length}) is less than minItems (${schema.minItems})`,
        keyword: 'minItems',
        schemaValue: schema.minItems,
        actualValue: data.length
      });
    }
    if (typeof schema.maxItems === 'number' && data.length > schema.maxItems) {
      errors.push({
        path: currentPath,
        message: `Array length (${data.length}) exceeds maxItems (${schema.maxItems})`,
        keyword: 'maxItems',
        schemaValue: schema.maxItems,
        actualValue: data.length
      });
    }
    if (schema.uniqueItems === true) {
      for (let i = 0; i < data.length; i++) {
        for (let j = i + 1; j < data.length; j++) {
          if (deepEqual(data[i], data[j])) {
            errors.push({
              path: `${currentPath}/${j}`,
              message: `Duplicate item found at indices ${i} and ${j} (uniqueItems is true)`,
              keyword: 'uniqueItems',
              schemaValue: true,
              actualValue: data[j]
            });
            break;
          }
        }
      }
    }

    if (schema.items) {
      if (Array.isArray(schema.items)) {
        // Tuple validation
        for (let i = 0; i < data.length; i++) {
          const itemSchema = schema.items[i];
          if (itemSchema) {
            const sub = validateSchema(data[i], itemSchema, `${currentPath}/${i}`);
            errors.push(...sub.errors);
          }
        }
      } else if (typeof schema.items === 'object') {
        // List validation
        for (let i = 0; i < data.length; i++) {
          const sub = validateSchema(data[i], schema.items, `${currentPath}/${i}`);
          errors.push(...sub.errors);
        }
      }
    }
  }

  // 7. Logical combinators: oneOf, anyOf, allOf, not
  if (Array.isArray(schema.allOf)) {
    for (let i = 0; i < schema.allOf.length; i++) {
      const sub = validateSchema(data, schema.allOf[i], currentPath);
      if (!sub.valid) {
        errors.push({
          path: currentPath,
          message: `Data failed allOf condition at index ${i}: ${sub.errors.map(e => e.message).join('; ')}`,
          keyword: 'allOf',
          schemaValue: schema.allOf[i],
          actualValue: data
        });
      }
    }
  }

  if (Array.isArray(schema.anyOf)) {
    const anyMatches = schema.anyOf.some(s => validateSchema(data, s, currentPath).valid);
    if (!anyMatches) {
      errors.push({
        path: currentPath,
        message: `Data does not match any of the subschemas in anyOf`,
        keyword: 'anyOf',
        schemaValue: schema.anyOf,
        actualValue: data
      });
    }
  }

  if (Array.isArray(schema.oneOf)) {
    const matchCount = schema.oneOf.filter(s => validateSchema(data, s, currentPath).valid).length;
    if (matchCount !== 1) {
      errors.push({
        path: currentPath,
        message: `Data must match exactly one schema in oneOf (matched ${matchCount})`,
        keyword: 'oneOf',
        schemaValue: schema.oneOf,
        actualValue: data
      });
    }
  }

  if (schema.not && typeof schema.not === 'object') {
    const notSub = validateSchema(data, schema.not, currentPath);
    if (notSub.valid) {
      errors.push({
        path: currentPath,
        message: `Data matched "not" schema which is forbidden`,
        keyword: 'not',
        schemaValue: schema.not,
        actualValue: data
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Automatically infers a JSON Schema definition from an arbitrary JavaScript object.
 * @param {any} value 
 * @returns {object}
 */
export function inferSchema(value) {
  if (value === null) return { type: 'null' };
  const t = typeof value;
  if (t === 'string') {
    if (FORMAT_VALIDATORS.uuid(value)) return { type: 'string', format: 'uuid' };
    if (FORMAT_VALIDATORS.email(value)) return { type: 'string', format: 'email' };
    if (FORMAT_VALIDATORS.date(value)) return { type: 'string', format: 'date' };
    if (FORMAT_VALIDATORS['date-time'](value)) return { type: 'string', format: 'date-time' };
    return { type: 'string' };
  }
  if (t === 'number') {
    return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' };
  }
  if (t === 'boolean') return { type: 'boolean' };
  if (Array.isArray(value)) {
    if (value.length === 0) return { type: 'array', items: {} };
    return {
      type: 'array',
      items: inferSchema(value[0])
    };
  }
  if (t === 'object') {
    const properties = {};
    const required = [];
    for (const [k, v] of Object.entries(value)) {
      properties[k] = inferSchema(v);
      required.push(k);
    }
    return {
      type: 'object',
      properties,
      required,
      additionalProperties: true
    };
  }
  return {};
}

function getTypeName(val) {
  if (val === null) return 'null';
  if (Array.isArray(val)) return 'array';
  return typeof val;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((item, idx) => deepEqual(item, b[idx]));
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(k => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}
