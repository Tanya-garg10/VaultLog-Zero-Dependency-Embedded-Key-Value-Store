// tests/router.test.mjs
// Unit tests for zero-dependency Router using node:test and node:assert.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '../src/core/router.mjs';

test('Router: Basic path registration and matching', () => {
  const router = new Router();
  router.get('/users', () => {});
  router.post('/users', () => {});

  const matchGet = router.match('GET', '/users');
  assert.ok(matchGet, 'Should match GET /users');
  assert.deepEqual(matchGet.params, {});

  const matchPost = router.match('POST', '/users');
  assert.ok(matchPost, 'Should match POST /users');

  const matchDelete = router.match('DELETE', '/users');
  assert.equal(matchDelete, null, 'DELETE /users should not match');
});

test('Router: Parameterized route matching (/users/:id/orders/:orderId)', () => {
  const router = new Router();
  router.get('/users/:id/orders/:orderId', () => {});

  const match = router.match('GET', '/users/usr_42/orders/ord_999');
  assert.ok(match);
  assert.equal(match.params.id, 'usr_42');
  assert.equal(match.params.orderId, 'ord_999');
});

test('Router: Wildcard route matching (/static/*file)', () => {
  const router = new Router();
  router.get('/static/*file', () => {});

  const match = router.match('GET', '/static/css/themes/dark.css');
  assert.ok(match);
  assert.equal(match.params.file, 'css/themes/dark.css');
});

test('Router: Middleware execution order & error handling', async () => {
  const router = new Router();
  const executionOrder = [];

  router.use(async (req, res, next) => {
    executionOrder.push('mw1_start');
    await next();
    executionOrder.push('mw1_end');
  });

  router.use(async (req, res, next) => {
    executionOrder.push('mw2_start');
    await next();
    executionOrder.push('mw2_end');
  });

  router.get('/test', (req, res) => {
    executionOrder.push('handler');
  });

  const req = { method: 'GET', url: '/test', headers: { host: 'localhost' } };
  const res = { writeHead() {}, end() {} };

  await router.handle(req, res);

  assert.deepEqual(executionOrder, [
    'mw1_start',
    'mw2_start',
    'handler',
    'mw2_end',
    'mw1_end'
  ]);
});

test('Router: Handles malformed and empty URLs gracefully', () => {
  const router = new Router();
  router.get('/', () => {});

  const matchRoot = router.match('GET', '/');
  assert.ok(matchRoot);

  const matchEmpty = router.match('GET', '');
  assert.ok(matchEmpty);
});
