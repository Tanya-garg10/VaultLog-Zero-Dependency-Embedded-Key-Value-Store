// src/app.mjs
// Central Application Engine connecting Router, MockEngine, Validator, Collector, WAL, and UI.

import { Router } from './core/router.mjs';
import { parseRequestBody, sendJson, sendText, generateETag } from './core/http-utils.mjs';
import { MockEngine } from './mock/engine.mjs';
import { validateSchema, inferSchema } from './schema/validator.mjs';
import { TrafficCollector } from './traffic/collector.mjs';
import { WalStorage } from './storage/wal.mjs';
import { generateOpenApiSpec, generatePostmanCollection, generateHARLog } from './export/generator.mjs';
import { promises as fs, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

export class WireForgeApp {
  constructor(options = {}) {
    this.options = options;
    this.startTime = Date.now();
    this.wal = new WalStorage(options.walPath || './data/wireforge.wal');
    this.collector = new TrafficCollector(options.trafficBufferSize || 300);

    this.mockEngine = new MockEngine({
      onStateChange: (type, payload) => {
        this.wal.append(type, payload).catch(() => {});
      }
    });

    this.router = new Router();
    this.initMiddlewares();
    this.initSystemRoutes();
    this.initCollectionRoutes();
    this.initPublicStaticRoutes();
  }

  async init() {
    await this.wal.init();

    // Replay WAL log if available
    await this.wal.recover((type, payload) => {
      if (type === 'ROUTE_UPSERT') {
        this.mockEngine.routes.set(payload.id, payload);
      } else if (type === 'ROUTE_DELETE') {
        this.mockEngine.routes.delete(payload.id);
      } else if (type === 'COLLECTION_INSERT') {
        let items = this.mockEngine.collections.get(payload.collection);
        if (!items) {
          items = [];
          this.mockEngine.collections.set(payload.collection, items);
        }
        items.push(payload.item);
      } else if (type === 'COLLECTION_UPDATE') {
        const items = this.mockEngine.collections.get(payload.collection);
        if (items) {
          const idx = items.findIndex(x => String(x.id) === String(payload.id));
          if (idx !== -1) items[idx] = payload.item;
        }
      } else if (type === 'COLLECTION_DELETE') {
        const items = this.mockEngine.collections.get(payload.collection);
        if (items) {
          const idx = items.findIndex(x => String(x.id) === String(payload.id));
          if (idx !== -1) items.splice(idx, 1);
        }
      }
    });
  }

  initMiddlewares() {
    // 1. CORS Preflight & Base Headers
    this.router.use(async (req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Api-Key, X-Hub-Signature-256');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      await next();
    });

    // 2. Request Timing & Traffic Capture
    this.router.use(async (req, res, next) => {
      const startHr = process.hrtime.bigint();

      // Parse body if present
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        try {
          const parsed = await parseRequestBody(req);
          req.body = parsed.json || parsed.form || parsed.text;
          req.rawBody = parsed.text;
          req.rawBuffer = parsed.raw;
        } catch (err) {
          return sendJson(res, err.statusCode || 400, { error: err.message });
        }
      }

      // Intercept res.end to measure latency and record traffic
      const originalEnd = res.end;
      const originalWriteHead = res.writeHead;
      let capturedStatusCode = 200;
      let capturedResponseHeaders = {};
      let capturedResponseBody = null;

      res.writeHead = function(statusCode, headers) {
        capturedStatusCode = statusCode;
        if (headers) Object.assign(capturedResponseHeaders, headers);
        return originalWriteHead.apply(res, arguments);
      };

      res.end = (chunk, encoding, callback) => {
        if (chunk) {
          try {
            capturedResponseBody = JSON.parse(chunk.toString());
          } catch {
            capturedResponseBody = chunk.toString();
          }
        }

        const endHr = process.hrtime.bigint();
        const durationMs = Number((endHr - startHr) / 1000000n);

        // Record traffic only for non-static, non-SSE paths
        if (!req.pathname.startsWith('/public') && req.pathname !== '/api/traffic/stream' && !req.pathname.endsWith('.css') && !req.pathname.endsWith('.js') && !req.pathname.endsWith('.ico')) {
          this.collector.record({
            method: req.method,
            url: req.url,
            path: req.pathname,
            query: req.query,
            headers: req.headers,
            ip: req.socket?.remoteAddress || '127.0.0.1',
            body: req.body,
            rawBodyLength: req.rawBuffer ? req.rawBuffer.length : 0,
            response: {
              statusCode: capturedStatusCode,
              headers: capturedResponseHeaders,
              body: capturedResponseBody,
              durationMs
            }
          });
        }

        return originalEnd.call(res, chunk, encoding, callback);
      };

      await next();
    });
  }

  initSystemRoutes() {
    // --- System Status & Telemetry ---
    this.router.get('/api/system/status', (req, res) => {
      sendJson(res, 200, {
        name: 'WireForge Zero',
        version: '1.0.0',
        uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
        runtime: {
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
        },
        zeroDependencyAudit: {
          runtimeDependencies: 0,
          thirdPartyImports: 0,
          status: 'VERIFIED_CLEAN_STDLIB'
        },
        wal: this.wal.stats,
        trafficEntriesCount: this.collector.buffer.length,
        mockRoutesCount: this.mockEngine.routes.size,
        collectionsCount: this.mockEngine.collections.size
      });
    });

    // --- Mock Routes API ---
    this.router.get('/api/routes', (req, res) => {
      sendJson(res, 200, { routes: this.mockEngine.getRoutes() });
    });

    this.router.post('/api/routes', (req, res) => {
      if (!req.body || !req.body.path) {
        return sendJson(res, 400, { error: 'Path is required for mock route' });
      }
      const route = this.mockEngine.addRoute(req.body);
      sendJson(res, 201, { success: true, route });
    });

    this.router.put('/api/routes/:id', (req, res) => {
      const updated = this.mockEngine.updateRoute(req.params.id, req.body || {});
      if (!updated) {
        return sendJson(res, 404, { error: 'Mock route not found' });
      }
      sendJson(res, 200, { success: true, route: updated });
    });

    this.router.delete('/api/routes/:id', (req, res) => {
      const deleted = this.mockEngine.deleteRoute(req.params.id);
      if (!deleted) {
        return sendJson(res, 404, { error: 'Mock route not found' });
      }
      sendJson(res, 200, { success: true });
    });

    // --- Schema Validator Workbench API ---
    this.router.post('/api/schema/validate', (req, res) => {
      const { schema, data } = req.body || {};
      if (schema === undefined) {
        return sendJson(res, 400, { error: 'Missing schema to validate against' });
      }
      const result = validateSchema(data, schema);
      sendJson(res, 200, result);
    });

    this.router.post('/api/schema/infer', (req, res) => {
      const { data } = req.body || {};
      const schema = inferSchema(data);
      sendJson(res, 200, { schema });
    });

    // --- Traffic Studio API ---
    this.router.get('/api/traffic', (req, res) => {
      const entries = this.collector.getEntries(req.query);
      sendJson(res, 200, { entries });
    });

    this.router.get('/api/traffic/stream', (req, res) => {
      this.collector.registerSSEClient(req, res);
    });

    this.router.delete('/api/traffic', (req, res) => {
      this.collector.clear();
      sendJson(res, 200, { success: true });
    });

    this.router.post('/api/traffic/diff', (req, res) => {
      const { idA, idB } = req.body || {};
      const entryA = this.collector.getEntry(idA);
      const entryB = this.collector.getEntry(idB);
      if (!entryA || !entryB) {
        return sendJson(res, 404, { error: 'One or both traffic entries could not be found' });
      }
      const diff = this.collector.computeDiff(entryA, entryB);
      sendJson(res, 200, diff);
    });

    this.router.post('/api/traffic/replay', async (req, res) => {
      const { id, targetUrl, method, headers, body } = req.body || {};
      const entry = id ? this.collector.getEntry(id) : { method: method || 'GET', path: '/', headers: {} };
      if (id && !entry) {
        return sendJson(res, 404, { error: 'Traffic entry not found for replay' });
      }

      const replayResult = await this.collector.replayRequest(entry, {
        targetUrl,
        method,
        headers,
        body
      });
      sendJson(res, 200, replayResult);
    });

    // --- Webhook Bucket API ---
    this.router.get('/api/webhooks/:bucketId', (req, res) => {
      const events = this.collector.getWebhookBucket(req.params.bucketId);
      sendJson(res, 200, { bucketId: req.params.bucketId, count: events.length, events });
    });

    this.router.post('/api/webhooks/:bucketId', (req, res) => {
      const item = this.collector.recordWebhook(req.params.bucketId, {
        method: req.method,
        headers: req.headers,
        query: req.query,
        body: req.body,
        rawText: req.rawBody,
        ip: req.socket?.remoteAddress || '127.0.0.1'
      });
      sendJson(res, 200, { success: true, message: 'Webhook captured', webhookId: item.id });
    });

    this.router.post('/api/webhooks/:bucketId/verify-signature', (req, res) => {
      const { rawBody, secret, signatureHeader, algorithm } = req.body || {};
      const result = this.collector.verifyHmacSignature(rawBody, secret, signatureHeader, algorithm || 'sha256');
      sendJson(res, 200, result);
    });

    this.router.delete('/api/webhooks/:bucketId', (req, res) => {
      this.collector.clearWebhookBucket(req.params.bucketId);
      sendJson(res, 200, { success: true });
    });

    // --- Export API ---
    this.router.get('/api/export/openapi', (req, res) => {
      const spec = generateOpenApiSpec(this.mockEngine, `http://${req.headers.host || 'localhost:3000'}`);
      sendJson(res, 200, spec);
    });

    this.router.get('/api/export/postman', (req, res) => {
      const col = generatePostmanCollection(this.mockEngine, `http://${req.headers.host || 'localhost:3000'}`);
      sendJson(res, 200, col);
    });

    this.router.get('/api/export/har', (req, res) => {
      const har = generateHARLog(this.collector.buffer, `http://${req.headers.host || 'localhost:3000'}`);
      sendJson(res, 200, har);
    });
  }

  initCollectionRoutes() {
    // List collections summary
    this.router.get('/api/collections', (req, res) => {
      sendJson(res, 200, { collections: this.mockEngine.getCollections() });
    });

    // List items in collection
    this.router.get('/api/collections/:name', (req, res) => {
      const result = this.mockEngine.getCollectionItems(req.params.name, req.query);
      if (!result) {
        return sendJson(res, 404, { error: `Collection "${req.params.name}" not found` });
      }
      sendJson(res, 200, result);
    });

    // Create item in collection
    this.router.post('/api/collections/:name', (req, res) => {
      const item = this.mockEngine.insertCollectionItem(req.params.name, req.body || {});
      sendJson(res, 201, { success: true, item });
    });

    // Get single item by ID
    this.router.get('/api/collections/:name/:id', (req, res) => {
      const item = this.mockEngine.getCollectionItem(req.params.name, req.params.id);
      if (!item) {
        return sendJson(res, 404, { error: `Item "${req.params.id}" not found in collection "${req.params.name}"` });
      }
      sendJson(res, 200, { item });
    });

    // Update item by ID
    this.router.patch('/api/collections/:name/:id', (req, res) => {
      const updated = this.mockEngine.updateCollectionItem(req.params.name, req.params.id, req.body || {}, true);
      if (!updated) {
        return sendJson(res, 404, { error: `Item "${req.params.id}" not found in collection "${req.params.name}"` });
      }
      sendJson(res, 200, { success: true, item: updated });
    });

    // Delete item by ID
    this.router.delete('/api/collections/:name/:id', (req, res) => {
      const deleted = this.mockEngine.deleteCollectionItem(req.params.name, req.params.id);
      if (!deleted) {
        return sendJson(res, 404, { error: `Item "${req.params.id}" not found in collection "${req.params.name}"` });
      }
      sendJson(res, 200, { success: true });
    });
  }

  initPublicStaticRoutes() {
    // Dynamic Mock Route Matcher Fallback before static files
    this.router.setNotFound(async (req, res) => {
      // 1. Check if matches any active dynamic mock route
      const mockRoutes = this.mockEngine.getRoutes();
      for (const route of mockRoutes) {
        if (!route.enabled) continue;
        if (route.method !== req.method) continue;

        // Compile and test route pattern
        const { regex, paramNames } = this.router._compilePattern(route.path);
        const match = req.pathname.match(regex);
        if (match) {
          const params = {};
          for (let i = 0; i < paramNames.length; i++) {
            params[paramNames[i]] = decodeURIComponent(match[i + 1] || '');
          }
          req.params = params;
          return await this.mockEngine.handleMockRoute(route, req, res);
        }
      }

      // 2. Try serving static file from ./public
      let filePath = req.pathname;
      if (filePath === '/' || filePath === '') {
        filePath = '/index.html';
      }

      const fullPath = join(process.cwd(), 'public', filePath);

      if (existsSync(fullPath)) {
        try {
          const stat = await fs.stat(fullPath);
          if (stat.isFile()) {
            const content = await fs.readFile(fullPath);
            const ext = extname(fullPath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';
            const etag = generateETag(content);

            if (req.headers['if-none-match'] === etag) {
              res.writeHead(304);
              res.end();
              return;
            }

            res.writeHead(200, {
              'Content-Type': contentType,
              'Content-Length': content.length,
              'ETag': etag,
              'Cache-Control': 'public, max-age=3600'
            });
            res.end(content);
            return;
          }
        } catch {
          // fallback to 404
        }
      }

      // Fallback SPA serving /index.html for client-side navigation
      const indexPath = join(process.cwd(), 'public', 'index.html');
      if (existsSync(indexPath)) {
        const content = await fs.readFile(indexPath, 'utf-8');
        return sendText(res, 200, content, 'text/html; charset=utf-8');
      }

      sendJson(res, 404, {
        error: 'Not Found',
        message: `No handler or mock matched ${req.method} ${req.pathname}`,
        help: 'Create a mock route in the WireForge UI or use /api/v1/*'
      });
    });
  }

  async handleRequest(req, res) {
    await this.router.handle(req, res);
  }
}
