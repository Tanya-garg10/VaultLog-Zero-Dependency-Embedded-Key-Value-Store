// tests/traffic-replay.test.mjs
// Unit tests for Traffic Collector, Ring Buffer, Diffing, and HMAC Signature verification.

import test from 'node:test';
import assert from 'node:assert/strict';
import { TrafficCollector } from '../src/traffic/collector.mjs';
import { createHmac } from 'node:crypto';

test('TrafficCollector: Ring Buffer sizing and filtering', () => {
  const collector = new TrafficCollector(5);

  for (let i = 1; i <= 8; i++) {
    collector.record({
      id: `req_${i}`,
      method: i % 2 === 0 ? 'POST' : 'GET',
      path: `/api/resource/${i}`,
      response: { statusCode: 200, durationMs: i * 10 }
    });
  }

  assert.equal(collector.buffer.length, 5, 'Buffer should maintain max capacity of 5');
  assert.equal(collector.buffer[0].id, 'req_8', 'Latest entry should be at head of buffer');
  assert.equal(collector.buffer[4].id, 'req_4', 'Oldest retained entry');

  const postOnly = collector.getEntries({ method: 'POST' });
  assert.equal(postOnly.length, 3);
});

test('TrafficCollector: Deep Object and Request Diffing Engine', () => {
  const collector = new TrafficCollector();

  const reqA = {
    id: 'a',
    timestamp: '2026-01-01T00:00:00Z',
    method: 'POST',
    path: '/api/v1/orders',
    headers: { 'content-type': 'application/json', 'authorization': 'Bearer tokenA' },
    body: { customerId: 'cust_1', total: 100, items: ['sku_1', 'sku_2'] }
  };

  const reqB = {
    id: 'b',
    timestamp: '2026-01-01T00:01:00Z',
    method: 'POST',
    path: '/api/v1/orders',
    headers: { 'content-type': 'application/json', 'authorization': 'Bearer tokenB' },
    body: { customerId: 'cust_1', total: 150, discount: 'SAVE10', items: ['sku_1', 'sku_3'] }
  };

  const diff = collector.computeDiff(reqA, reqB);

  assert.equal(diff.methodDiff, null);
  assert.equal(diff.pathDiff, null);

  // Body diff checks
  const totalDiff = diff.bodyDiff.find(d => d.path === 'total');
  assert.ok(totalDiff);
  assert.equal(totalDiff.before, 100);
  assert.equal(totalDiff.after, 150);

  const discountDiff = diff.bodyDiff.find(d => d.path === 'discount');
  assert.ok(discountDiff);
  assert.equal(discountDiff.type, 'added');
  assert.equal(discountDiff.value, 'SAVE10');
});

test('TrafficCollector: HMAC-SHA256 Signature Verification', () => {
  const collector = new TrafficCollector();
  const rawBody = JSON.stringify({ event: 'charge.succeeded', amount: 5000 });
  const secret = 'whsec_test_secret_key_123';

  const validSignature = createHmac('sha256', secret).update(rawBody).digest('hex');

  // Verify valid signature
  const validRes = collector.verifyHmacSignature(rawBody, secret, `sha256=${validSignature}`);
  assert.equal(validRes.valid, true);

  // Verify invalid signature
  const invalidRes = collector.verifyHmacSignature(rawBody, secret, 'sha256=invalid_hash_signature_0000');
  assert.equal(invalidRes.valid, false);
});
