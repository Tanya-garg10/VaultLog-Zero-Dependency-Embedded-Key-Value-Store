// tests/schema-validator.test.mjs
// Unit tests for the Zero-Dependency Schema Validator (Package Killer).

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSchema, inferSchema } from '../src/schema/validator.mjs';

test('Validator: Primitives & Types (string, number, integer, boolean, null)', () => {
  assert.equal(validateSchema('hello', { type: 'string' }).valid, true);
  assert.equal(validateSchema(123, { type: 'string' }).valid, false);
  
  assert.equal(validateSchema(42, { type: 'integer' }).valid, true);
  assert.equal(validateSchema(42.5, { type: 'integer' }).valid, false);
  assert.equal(validateSchema(42.5, { type: 'number' }).valid, true);
  
  assert.equal(validateSchema(true, { type: 'boolean' }).valid, true);
  assert.equal(validateSchema(null, { type: 'null' }).valid, true);
});

test('Validator: Number boundary constraints (minimum, maximum, multipleOf)', () => {
  const schema = {
    type: 'number',
    minimum: 10,
    maximum: 100,
    multipleOf: 5
  };

  assert.equal(validateSchema(25, schema).valid, true);
  assert.equal(validateSchema(5, schema).valid, false); // < minimum
  assert.equal(validateSchema(105, schema).valid, false); // > maximum
  assert.equal(validateSchema(23, schema).valid, false); // not multiple of 5
});

test('Validator: String regex patterns & format validators', () => {
  const emailSchema = { type: 'string', format: 'email' };
  assert.equal(validateSchema('test@example.com', emailSchema).valid, true);
  assert.equal(validateSchema('not-an-email', emailSchema).valid, false);

  const uuidSchema = { type: 'string', format: 'uuid' };
  assert.equal(validateSchema('123e4567-e89b-12d3-a456-426614174000', uuidSchema).valid, true);
  assert.equal(validateSchema('invalid-uuid-1234', uuidSchema).valid, false);

  const patternSchema = { type: 'string', pattern: '^SKU-[0-9]{4}$' };
  assert.equal(validateSchema('SKU-1024', patternSchema).valid, true);
  assert.equal(validateSchema('SKU-ABCD', patternSchema).valid, false);
});

test('Validator: Nested Objects & Required properties with exact error path attribution', () => {
  const schema = {
    type: 'object',
    required: ['user', 'action'],
    properties: {
      action: { type: 'string', enum: ['create', 'update', 'delete'] },
      user: {
        type: 'object',
        required: ['id', 'email', 'profile'],
        properties: {
          id: { type: 'string' },
          email: { type: 'string', format: 'email' },
          profile: {
            type: 'object',
            required: ['age'],
            properties: {
              age: { type: 'integer', minimum: 18 }
            }
          }
        }
      }
    }
  };

  // Valid payload
  const validData = {
    action: 'create',
    user: {
      id: 'u1',
      email: 'alex@example.com',
      profile: { age: 25 }
    }
  };
  assert.equal(validateSchema(validData, schema).valid, true);

  // Invalid nested age (< 18)
  const invalidAge = {
    action: 'create',
    user: {
      id: 'u1',
      email: 'alex@example.com',
      profile: { age: 14 }
    }
  };
  const resAge = validateSchema(invalidAge, schema);
  assert.equal(resAge.valid, false);
  assert.equal(resAge.errors[0].path, '#/user/profile/age');

  // Missing required property
  const missingAction = { user: { id: 'u1', email: 'alex@example.com', profile: { age: 25 } } };
  const resMissing = validateSchema(missingAction, schema);
  assert.equal(resMissing.valid, false);
  assert.equal(resMissing.errors[0].path, '#/action');
});

test('Validator: Array validations (minItems, uniqueItems, item schema)', () => {
  const schema = {
    type: 'array',
    minItems: 2,
    uniqueItems: true,
    items: { type: 'number' }
  };

  assert.equal(validateSchema([1, 2, 3], schema).valid, true);
  assert.equal(validateSchema([1], schema).valid, false); // < minItems
  assert.equal(validateSchema([1, 2, 1], schema).valid, false); // duplicate items
  assert.equal(validateSchema([1, 'two'], schema).valid, false); // item type mismatch
});

test('Validator: Logical combinators (oneOf, anyOf, allOf, not)', () => {
  const oneOfSchema = {
    oneOf: [
      { type: 'string', maxLength: 3 },
      { type: 'string', minLength: 10 }
    ]
  };
  assert.equal(validateSchema('ab', oneOfSchema).valid, true);
  assert.equal(validateSchema('superlongstring', oneOfSchema).valid, true);
  assert.equal(validateSchema('medium', oneOfSchema).valid, false);

  const notSchema = { not: { type: 'string' } };
  assert.equal(validateSchema(123, notSchema).valid, true);
  assert.equal(validateSchema('hello', notSchema).valid, false);
});

test('Validator: Automatic Schema Inference from data', () => {
  const sample = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Jordan',
    age: 30,
    active: true,
    tags: ['admin', 'developer']
  };

  const inferred = inferSchema(sample);
  assert.equal(inferred.type, 'object');
  assert.equal(inferred.properties.id.format, 'uuid');
  assert.equal(inferred.properties.age.type, 'integer');
  assert.equal(inferred.properties.tags.type, 'array');

  // Verify inferred schema validates the original sample
  assert.equal(validateSchema(sample, inferred).valid, true);
});
