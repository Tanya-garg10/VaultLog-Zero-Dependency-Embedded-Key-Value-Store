// src/mock/engine.mjs
// Dynamic Mock Engine with stateful collections, template interpolation, schema validation, and chaos injection.

import { faker } from './faker.mjs';
import { validateSchema } from '../schema/validator.mjs';
import { sendJson } from '../core/http-utils.mjs';

export class MockEngine {
  constructor(options = {}) {
    this.routes = new Map(); // id -> RouteMock
    this.collections = new Map(); // name -> Array<Record>
    this.onStateChange = options.onStateChange || (() => {});

    this.initDefaultMocks();
  }

  initDefaultMocks() {
    // 1. Seed demo collection: "users"
    const demoUsers = [];
    for (let i = 1; i <= 6; i++) {
      const name = faker.name();
      demoUsers.push({
        id: `usr_${i}`,
        name,
        email: faker.email(name),
        role: i === 1 ? 'admin' : (i <= 3 ? 'developer' : 'viewer'),
        department: faker.department(),
        company: faker.company(),
        createdAt: faker.isoDate(30, 2),
        active: true
      });
    }
    this.collections.set('users', demoUsers);

    // 2. Seed demo collection: "payments"
    const demoPayments = [];
    for (let i = 1; i <= 8; i++) {
      demoPayments.push({
        id: `pay_${faker.uuid().slice(0, 8)}`,
        userId: `usr_${faker.int(1, 6)}`,
        amount: faker.float(25, 990, 2),
        currency: 'USD',
        status: faker.choice(['succeeded', 'succeeded', 'succeeded', 'pending', 'refunded']),
        description: `API Platform Tier - ${faker.choice(['Starter', 'Pro', 'Enterprise'])}`,
        createdAt: faker.isoDate(14, 0)
      });
    }
    this.collections.set('payments', demoPayments);

    // 3. Seed default mock routes
    this.addRoute({
      id: 'mock_weather',
      name: 'Real-Time Telemetry API',
      method: 'GET',
      path: '/api/v1/telemetry',
      status: 200,
      headers: { 'X-Custom-Engine': 'WireForge-Zero' },
      latencyMs: 80,
      jitterMs: 40,
      errorRate: 0,
      responseBody: {
        node: 'edge-cluster-01',
        timestamp: '{{timestamp}}',
        metrics: {
          cpuLoad: '{{faker.float(10, 85, 2)}}%',
          memoryUsedMb: '{{faker.int(2048, 8192)}}',
          activeSockets: '{{faker.int(120, 1500)}}'
        },
        status: 'healthy'
      },
      schema: null,
      enabled: true
    });

    this.addRoute({
      id: 'mock_order_checkout',
      name: 'Order Checkout with Schema Validation',
      method: 'POST',
      path: '/api/v1/orders/checkout',
      status: 201,
      headers: {},
      latencyMs: 150,
      jitterMs: 50,
      errorRate: 0,
      schema: {
        type: 'object',
        required: ['customerId', 'items', 'totalAmount'],
        properties: {
          customerId: { type: 'string', minLength: 3 },
          totalAmount: { type: 'number', minimum: 1 },
          items: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['sku', 'quantity', 'price'],
              properties: {
                sku: { type: 'string' },
                quantity: { type: 'integer', minimum: 1 },
                price: { type: 'number', minimum: 0.01 }
              }
            }
          }
        }
      },
      responseBody: {
        orderId: 'ord_{{uuid}}',
        customerId: '{{req.body.customerId}}',
        status: 'confirmed',
        totalAmount: '{{req.body.totalAmount}}',
        estimatedDelivery: '{{isoDate}}',
        message: 'Order created and payment authorized successfully'
      },
      enabled: true
    });
  }

  // --- Route Management ---

  getRoutes() {
    return Array.from(this.routes.values());
  }

  getRoute(id) {
    return this.routes.get(id);
  }

  addRoute(routeData) {
    const route = {
      id: routeData.id || `mock_${faker.uuid().slice(0, 8)}`,
      name: routeData.name || 'Unnamed Mock Route',
      method: (routeData.method || 'GET').toUpperCase(),
      path: routeData.path.startsWith('/') ? routeData.path : `/${routeData.path}`,
      status: Number(routeData.status) || 200,
      headers: routeData.headers || {},
      latencyMs: Number(routeData.latencyMs) || 0,
      jitterMs: Number(routeData.jitterMs) || 0,
      errorRate: Number(routeData.errorRate) || 0,
      responseBody: routeData.responseBody ?? { message: 'OK' },
      schema: routeData.schema || null,
      enabled: routeData.enabled !== false,
      updatedAt: new Date().toISOString()
    };
    this.routes.set(route.id, route);
    this.onStateChange('ROUTE_UPSERT', route);
    return route;
  }

  updateRoute(id, updates) {
    const existing = this.routes.get(id);
    if (!existing) return null;
    const updated = {
      ...existing,
      ...updates,
      id,
      method: updates.method ? updates.method.toUpperCase() : existing.method,
      path: updates.path ? (updates.path.startsWith('/') ? updates.path : `/${updates.path}`) : existing.path,
      status: updates.status !== undefined ? Number(updates.status) : existing.status,
      updatedAt: new Date().toISOString()
    };
    this.routes.set(id, updated);
    this.onStateChange('ROUTE_UPSERT', updated);
    return updated;
  }

  deleteRoute(id) {
    const existed = this.routes.delete(id);
    if (existed) {
      this.onStateChange('ROUTE_DELETE', { id });
    }
    return existed;
  }

  // --- Collection CRUD Store ---

  getCollections() {
    const summary = {};
    for (const [name, items] of this.collections.entries()) {
      summary[name] = { count: items.length, sample: items.slice(0, 2) };
    }
    return summary;
  }

  getCollectionItems(name, query = {}) {
    const items = this.collections.get(name);
    if (!items) return null;

    let result = [...items];

    // Filter by text search 'q'
    if (query.q) {
      const q = String(query.q).toLowerCase();
      result = result.filter(item => JSON.stringify(item).toLowerCase().includes(q));
    }

    // Filter by exact fields or comparisons (e.g. status=active, age_gte=18)
    for (const [key, val] of Object.entries(query)) {
      if (key.startsWith('_') || key === 'q') continue;

      if (key.endsWith('_gte')) {
        const field = key.slice(0, -4);
        result = result.filter(item => item[field] >= Number(val));
      } else if (key.endsWith('_lte')) {
        const field = key.slice(0, -4);
        result = result.filter(item => item[field] <= Number(val));
      } else if (key.endsWith('_ne')) {
        const field = key.slice(0, -3);
        result = result.filter(item => String(item[field]) !== String(val));
      } else {
        result = result.filter(item => String(item[key]).toLowerCase() === String(val).toLowerCase());
      }
    }

    // Sorting: _sort and _order
    if (query._sort) {
      const sortField = query._sort;
      const order = (query._order || 'asc').toLowerCase() === 'desc' ? -1 : 1;
      result.sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];
        if (valA < valB) return -1 * order;
        if (valA > valB) return 1 * order;
        return 0;
      });
    }

    // Pagination: _page, _limit
    const totalCount = result.length;
    if (query._page || query._limit) {
      const page = Math.max(1, parseInt(query._page, 10) || 1);
      const limit = Math.max(1, parseInt(query._limit, 10) || 10);
      const start = (page - 1) * limit;
      result = result.slice(start, start + limit);
      return {
        data: result,
        meta: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit)
        }
      };
    }

    return { data: result, meta: { totalCount } };
  }

  getCollectionItem(name, id) {
    const items = this.collections.get(name);
    if (!items) return null;
    return items.find(item => String(item.id) === String(id)) || null;
  }

  insertCollectionItem(name, item) {
    let items = this.collections.get(name);
    if (!items) {
      items = [];
      this.collections.set(name, items);
    }
    const newItem = {
      id: item.id || `${name.slice(0, 3)}_${faker.uuid().slice(0, 8)}`,
      ...item,
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    items.push(newItem);
    this.onStateChange('COLLECTION_INSERT', { collection: name, item: newItem });
    return newItem;
  }

  updateCollectionItem(name, id, updates, partial = true) {
    const items = this.collections.get(name);
    if (!items) return null;
    const index = items.findIndex(item => String(item.id) === String(id));
    if (index === -1) return null;

    const existing = items[index];
    const updated = partial
      ? { ...existing, ...updates, id: existing.id, updatedAt: new Date().toISOString() }
      : { ...updates, id: existing.id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };

    items[index] = updated;
    this.onStateChange('COLLECTION_UPDATE', { collection: name, id, item: updated });
    return updated;
  }

  deleteCollectionItem(name, id) {
    const items = this.collections.get(name);
    if (!items) return false;
    const index = items.findIndex(item => String(item.id) === String(id));
    if (index === -1) return false;

    items.splice(index, 1);
    this.onStateChange('COLLECTION_DELETE', { collection: name, id });
    return true;
  }

  // --- Dynamic Template Interpolation ---

  interpolateTemplate(template, context = {}) {
    if (typeof template === 'string') {
      return this._replacePlaceholders(template, context);
    }
    if (Array.isArray(template)) {
      return template.map(item => this.interpolateTemplate(item, context));
    }
    if (typeof template === 'object' && template !== null) {
      const res = {};
      for (const [k, v] of Object.entries(template)) {
        res[k] = this.interpolateTemplate(v, context);
      }
      return res;
    }
    return template;
  }

  _replacePlaceholders(str, context) {
    return str.replace(/\{\{([^{}]+)\}\}/g, (match, expr) => {
      const trimmed = expr.trim();

      // Standard tokens
      if (trimmed === 'uuid') return faker.uuid();
      if (trimmed === 'timestamp') return Date.now();
      if (trimmed === 'isoDate') return new Date().toISOString();

      // Faker expressions: faker.name, faker.email, faker.int(min, max), faker.float(min, max, prec), faker.choice('a', 'b')
      if (trimmed.startsWith('faker.')) {
        const fakerCall = trimmed.slice(6);
        const parenIdx = fakerCall.indexOf('(');
        if (parenIdx > -1) {
          const fnName = fakerCall.substring(0, parenIdx);
          const argsStr = fakerCall.substring(parenIdx + 1, fakerCall.lastIndexOf(')'));
          const args = argsStr.split(',').map(a => {
            const raw = a.trim().replace(/^['"]|['"]$/g, '');
            const num = Number(raw);
            return isNaN(num) ? raw : num;
          });
          if (typeof faker[fnName] === 'function') {
            return faker[fnName](...args);
          }
        } else if (typeof faker[fakerCall] === 'function') {
          return faker[fakerCall]();
        }
      }

      // Context access: req.params.id, req.query.foo, req.body.bar, req.headers.authorization
      if (trimmed.startsWith('req.')) {
        const parts = trimmed.split('.');
        let curr = context.req;
        for (let i = 1; i < parts.length; i++) {
          if (!curr) return '';
          const part = parts[i];
          curr = curr[part];
        }
        return curr !== undefined ? String(curr) : '';
      }

      return match;
    });
  }

  // --- Dispatch Custom Mock Route Execution ---

  async handleMockRoute(route, req, res) {
    // 1. Latency & Jitter Simulation
    const latency = route.latencyMs + (route.jitterMs ? faker.int(-route.jitterMs, route.jitterMs) : 0);
    if (latency > 0) {
      await new Promise(r => setTimeout(r, Math.max(0, latency)));
    }

    // 2. Chaos / Fault Injection (Random Failure Rate)
    if (route.errorRate > 0) {
      const roll = Math.random() * 100;
      if (roll < route.errorRate) {
        return sendJson(res, 503, {
          error: 'Service Unavailable',
          message: 'WireForge Chaos Injection Triggered',
          simulated: true,
          routeId: route.id
        });
      }
    }

    // 3. Schema Validation on Request Body
    if (route.schema && req.method !== 'GET' && req.method !== 'HEAD') {
      const bodyToValidate = req.body || {};
      const validation = validateSchema(bodyToValidate, route.schema);
      if (!validation.valid) {
        return sendJson(res, 422, {
          error: 'Unprocessable Entity',
          message: 'Request payload failed JSON Schema validation',
          validationErrors: validation.errors
        });
      }
    }

    // 4. Interpolate Response Body
    const context = {
      req: {
        params: req.params || {},
        query: req.query || {},
        headers: req.headers || {},
        body: req.body || {}
      }
    };

    let responseData = this.interpolateTemplate(route.responseBody, context);

    // If raw string returned that is valid JSON, parse it
    if (typeof responseData === 'string') {
      try {
        responseData = JSON.parse(responseData);
      } catch {
        // keep as string
      }
    }

    sendJson(res, route.status, responseData, route.headers || {});
  }
}
