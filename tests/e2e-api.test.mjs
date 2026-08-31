// tests/e2e-api.test.mjs
// End-to-End API and concurrency tests over standard node:http.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WireForgeApp } from '../src/app.mjs';

const TEST_PORT = 3999;
let server;
let app;

test.before(async () => {
  app = new WireForgeApp({ walPath: './data/test_e2e.wal' });
  await app.init();
  server = createServer((req, res) => app.handleRequest(req, res));
  await new Promise(resolve => server.listen(TEST_PORT, '127.0.0.1', resolve));
});

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  await app.wal.clear();
});

test('E2E: GET /api/system/status returns zero-dep audit status', async () => {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/system/status`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.name, 'WireForge Zero');
  assert.equal(data.zeroDependencyAudit.runtimeDependencies, 0);
  assert.equal(data.zeroDependencyAudit.status, 'VERIFIED_CLEAN_STDLIB');
});

test('E2E: GET /api/v1/telemetry dynamic template mock execution', async () => {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/v1/telemetry`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.node, 'edge-cluster-01');
  assert.ok(data.metrics.cpuLoad.endsWith('%'));
  assert.ok(Number(data.timestamp) > 0);
});

test('E2E: POST /api/v1/orders/checkout with Schema Validation', async () => {
  // 1. Valid request conforming to schema
  const validPayload = {
    customerId: 'cust_alpha_1',
    totalAmount: 149.99,
    items: [
      { sku: 'PRO-SEAT', quantity: 1, price: 149.99 }
    ]
  };
  const resValid = await fetch(`http://127.0.0.1:${TEST_PORT}/api/v1/orders/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validPayload)
  });
  assert.equal(resValid.status, 201);
  const dataValid = await resValid.json();
  assert.equal(dataValid.customerId, 'cust_alpha_1');
  assert.equal(dataValid.status, 'confirmed');

  // 2. Invalid request violating schema (missing required totalAmount & invalid item quantity)
  const invalidPayload = {
    customerId: 'c1',
    items: [
      { sku: 'SKU1', quantity: 0, price: 10 } // quantity must be >= 1
    ]
  };
  const resInvalid = await fetch(`http://127.0.0.1:${TEST_PORT}/api/v1/orders/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(invalidPayload)
  });
  assert.equal(resInvalid.status, 422);
  const dataInvalid = await resInvalid.json();
  assert.equal(dataInvalid.error, 'Unprocessable Entity');
  assert.ok(dataInvalid.validationErrors.length >= 1);
});

test('E2E: Concurrent requests execution handling', async () => {
  const requests = [];
  for (let i = 0; i < 20; i++) {
    requests.push(fetch(`http://127.0.0.1:${TEST_PORT}/api/collections/users?_page=1&_limit=2`));
  }

  const responses = await Promise.all(requests);
  for (const res of responses) {
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.length, 2);
  }
});
