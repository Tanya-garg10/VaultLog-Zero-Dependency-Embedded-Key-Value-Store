// tests/mock-engine.test.mjs
// Unit tests for Mock Engine, Collections, and Template Interpolation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { MockEngine } from '../src/mock/engine.mjs';

test('MockEngine: Route registration, updates, and deletion', () => {
  const engine = new MockEngine();
  const route = engine.addRoute({
    name: 'Custom Mock',
    method: 'GET',
    path: '/api/v1/custom',
    status: 200,
    responseBody: { message: 'hello' }
  });

  assert.ok(route.id);
  assert.equal(engine.getRoute(route.id).name, 'Custom Mock');

  const updated = engine.updateRoute(route.id, { name: 'Updated Name', status: 202 });
  assert.equal(updated.name, 'Updated Name');
  assert.equal(updated.status, 202);

  const deleted = engine.deleteRoute(route.id);
  assert.equal(deleted, true);
  assert.equal(engine.getRoute(route.id), undefined);
});

test('MockEngine: Dynamic template interpolation (faker, uuid, req context)', () => {
  const engine = new MockEngine();

  const template = {
    id: 'user_{{uuid}}',
    name: '{{faker.name}}',
    email: '{{faker.email}}',
    city: '{{faker.city}}',
    amount: '{{faker.float(10, 50, 2)}}',
    contextParam: '{{req.params.userId}}',
    querySearch: '{{req.query.q}}'
  };

  const context = {
    req: {
      params: { userId: 'usr_888' },
      query: { q: 'search_term' }
    }
  };

  const expanded = engine.interpolateTemplate(template, context);

  assert.ok(expanded.id.startsWith('user_'));
  assert.ok(expanded.name.length > 2);
  assert.ok(expanded.email.includes('@'));
  assert.equal(expanded.contextParam, 'usr_888');
  assert.equal(expanded.querySearch, 'search_term');
});

test('MockEngine: Collections CRUD, filtering, sorting, pagination', () => {
  const engine = new MockEngine();

  // Insert items
  engine.insertCollectionItem('products', { id: 'p1', name: 'Keyboard', price: 99, category: 'hardware' });
  engine.insertCollectionItem('products', { id: 'p2', name: 'Mouse', price: 49, category: 'hardware' });
  engine.insertCollectionItem('products', { id: 'p3', name: 'Editor Pro', price: 199, category: 'software' });

  // Filter by category
  const hardware = engine.getCollectionItems('products', { category: 'hardware' });
  assert.equal(hardware.data.length, 2);

  // Sorting
  const sortedDesc = engine.getCollectionItems('products', { _sort: 'price', _order: 'desc' });
  assert.equal(sortedDesc.data[0].id, 'p3'); // highest price 199
  assert.equal(sortedDesc.data[2].id, 'p2'); // lowest price 49

  // Pagination
  const page1 = engine.getCollectionItems('products', { _page: 1, _limit: 2 });
  assert.equal(page1.data.length, 2);
  assert.equal(page1.meta.totalPages, 2);

  // Partial update
  const updated = engine.updateCollectionItem('products', 'p1', { price: 89 });
  assert.equal(updated.price, 89);
  assert.equal(updated.name, 'Keyboard');

  // Delete
  const deleted = engine.deleteCollectionItem('products', 'p2');
  assert.equal(deleted, true);
  assert.equal(engine.getCollectionItem('products', 'p2'), null);
});
