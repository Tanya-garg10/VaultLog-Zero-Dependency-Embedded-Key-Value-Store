// tests/export.test.mjs
// Unit tests for OpenAPI 3.0, Postman Collection, and HAR Exporters.

import test from 'node:test';
import assert from 'node:assert/strict';
import { MockEngine } from '../src/mock/engine.mjs';
import { generateOpenApiSpec, generatePostmanCollection, generateHARLog } from '../src/export/generator.mjs';

test('Exporters: OpenAPI 3.0.3 specification generator', () => {
  const engine = new MockEngine();
  const spec = generateOpenApiSpec(engine, 'http://localhost:3000');

  assert.equal(spec.openapi, '3.0.3');
  assert.ok(spec.paths['/api/v1/telemetry']);
  assert.ok(spec.paths['/api/v1/telemetry'].get);
  assert.ok(spec.paths['/api/collections/users']);
});

test('Exporters: Postman Collection v2.1 generator', () => {
  const engine = new MockEngine();
  const collection = generatePostmanCollection(engine, 'http://localhost:3000');

  assert.equal(collection.info.schema, 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
  assert.ok(collection.item.length > 0);
  assert.ok(collection.variable.find(v => v.key === 'baseUrl'));
});

test('Exporters: HAR 1.2 log generator', () => {
  const sampleEntries = [
    {
      id: '1',
      timestamp: '2026-01-01T00:00:00.000Z',
      method: 'GET',
      path: '/api/v1/telemetry',
      headers: { 'user-agent': 'WireForgeTest' },
      response: { statusCode: 200, headers: { 'content-type': 'application/json' }, body: { ok: true }, durationMs: 15 }
    }
  ];

  const har = generateHARLog(sampleEntries, 'http://localhost:3000');
  assert.equal(har.log.version, '1.2');
  assert.equal(har.log.entries.length, 1);
  assert.equal(har.log.entries[0].request.method, 'GET');
  assert.equal(har.log.entries[0].response.status, 200);
});
