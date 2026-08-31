// src/traffic/collector.mjs
// Real-time Traffic Ring Buffer, Server-Sent Events (SSE) streaming, Request Diffing, and HTTP Replayer.

import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { randomUUID, createHmac } from 'node:crypto';
import { EventEmitter } from 'node:events';

export class TrafficCollector extends EventEmitter {
  constructor(maxSize = 250) {
    super();
    this.maxSize = maxSize;
    this.buffer = [];
    this.sseClients = new Set();
    this.webhooks = new Map(); // bucketId -> Array<WebhookEvent>
  }

  /**
   * Record a completed HTTP request/response cycle
   */
  record(entry) {
    const record = {
      id: entry.id || randomUUID(),
      timestamp: entry.timestamp || new Date().toISOString(),
      method: entry.method,
      url: entry.url,
      path: entry.path,
      query: entry.query || {},
      headers: entry.headers || {},
      ip: entry.ip || '127.0.0.1',
      body: entry.body,
      rawBodyLength: entry.rawBodyLength || 0,
      response: {
        statusCode: entry.response?.statusCode || 200,
        headers: entry.response?.headers || {},
        body: entry.response?.body,
        durationMs: entry.response?.durationMs || 0
      },
      tags: entry.tags || []
    };

    this.buffer.unshift(record);
    if (this.buffer.length > this.maxSize) {
      this.buffer.pop();
    }

    this.emit('traffic', record);
    this.broadcastSSE('traffic', record);

    return record;
  }

  getEntries(filter = {}) {
    let result = this.buffer;
    if (filter.method) {
      result = result.filter(r => r.method === filter.method.toUpperCase());
    }
    if (filter.path) {
      result = result.filter(r => r.path.includes(filter.path));
    }
    if (filter.statusCode) {
      result = result.filter(r => r.response.statusCode === Number(filter.statusCode));
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(r => 
        r.path.toLowerCase().includes(q) ||
        JSON.stringify(r.body || '').toLowerCase().includes(q) ||
        JSON.stringify(r.response?.body || '').toLowerCase().includes(q)
      );
    }
    return result;
  }

  getEntry(id) {
    return this.buffer.find(r => r.id === id) || null;
  }

  clear() {
    this.buffer = [];
    this.broadcastSSE('cleared', {});
  }

  // --- Webhook Bucket Storage ---

  recordWebhook(bucketId, event) {
    if (!this.webhooks.has(bucketId)) {
      this.webhooks.set(bucketId, []);
    }
    const bucket = this.webhooks.get(bucketId);
    const item = {
      id: randomUUID(),
      bucketId,
      receivedAt: new Date().toISOString(),
      method: event.method,
      headers: event.headers,
      query: event.query,
      body: event.body,
      rawText: event.rawText,
      ip: event.ip
    };
    bucket.unshift(item);
    if (bucket.length > 100) bucket.pop();

    this.broadcastSSE('webhook', item);
    return item;
  }

  getWebhookBucket(bucketId) {
    return this.webhooks.get(bucketId) || [];
  }

  clearWebhookBucket(bucketId) {
    this.webhooks.delete(bucketId);
  }

  verifyHmacSignature(rawBody, secret, signatureHeader, algorithm = 'sha256') {
    if (!signatureHeader || !secret) return { valid: false, message: 'Missing secret or signature' };
    const cleanSig = signatureHeader.replace(/^(sha256=|sha1=)/i, '').trim();
    const computed = createHmac(algorithm, secret).update(rawBody || '').digest('hex');
    const valid = computed.toLowerCase() === cleanSig.toLowerCase();
    return {
      valid,
      computedSignature: computed,
      providedSignature: cleanSig,
      algorithm
    };
  }

  // --- Server-Sent Events (SSE) Stream ---

  registerSSEClient(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('data: {"type":"connected","message":"WireForge Traffic Stream Active"}\n\n');

    this.sseClients.add(res);

    req.on('close', () => {
      this.sseClients.delete(res);
    });
  }

  broadcastSSE(type, data) {
    if (this.sseClients.size === 0) return;
    const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(msg);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  // --- Request Diffing Engine ---

  computeDiff(entryA, entryB) {
    if (!entryA || !entryB) {
      return { error: 'Both entries must be provided for diff' };
    }

    const bodyDiff = this._diffObjects(entryA.body, entryB.body);
    const headerDiff = this._diffObjects(entryA.headers, entryB.headers);
    const responseDiff = this._diffObjects(entryA.response?.body, entryB.response?.body);

    return {
      idA: entryA.id,
      idB: entryB.id,
      timestampA: entryA.timestamp,
      timestampB: entryB.timestamp,
      methodDiff: entryA.method !== entryB.method ? { from: entryA.method, to: entryB.method } : null,
      pathDiff: entryA.path !== entryB.path ? { from: entryA.path, to: entryB.path } : null,
      bodyDiff,
      headerDiff,
      responseDiff
    };
  }

  _diffObjects(objA, objB, path = '') {
    const diffs = [];
    if (objA === objB) return diffs;

    if (typeof objA !== typeof objB || objA === null || objB === null || typeof objA !== 'object') {
      diffs.push({ path: path || '#', type: 'changed', before: objA, after: objB });
      return diffs;
    }

    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);
    const allKeys = Array.from(new Set([...keysA, ...keysB]));

    for (const key of allKeys) {
      const currentPath = path ? `${path}.${key}` : key;
      if (!(key in objA)) {
        diffs.push({ path: currentPath, type: 'added', value: objB[key] });
      } else if (!(key in objB)) {
        diffs.push({ path: currentPath, type: 'removed', value: objA[key] });
      } else if (typeof objA[key] === 'object' && objA[key] !== null && typeof objB[key] === 'object' && objB[key] !== null) {
        diffs.push(...this._diffObjects(objA[key], objB[key], currentPath));
      } else if (objA[key] !== objB[key]) {
        diffs.push({ path: currentPath, type: 'modified', before: objA[key], after: objB[key] });
      }
    }

    return diffs;
  }

  // --- Upstream Traffic Replayer ---

  async replayRequest(entry, options = {}) {
    const targetUrlStr = options.targetUrl || entry.url || `http://localhost:3000${entry.path}`;
    const targetUrl = new URL(targetUrlStr);

    const headers = { ...entry.headers, ...(options.headers || {}) };
    delete headers['host'];
    delete headers['content-length'];

    const client = targetUrl.protocol === 'https:' ? httpsRequest : httpRequest;

    const payload = options.body !== undefined
      ? (typeof options.body === 'object' ? JSON.stringify(options.body) : String(options.body))
      : (entry.body ? (typeof entry.body === 'object' ? JSON.stringify(entry.body) : String(entry.body)) : null);

    if (payload) {
      headers['content-length'] = Buffer.byteLength(payload);
    }

    const startTime = Date.now();

    return new Promise((resolve) => {
      const req = client(targetUrl, {
        method: options.method || entry.method || 'GET',
        headers,
        timeout: options.timeout || 10000
      }, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const durationMs = Date.now() - startTime;
          const rawResponse = Buffer.concat(chunks).toString('utf-8');
          let parsedJson = null;
          try {
            parsedJson = JSON.parse(rawResponse);
          } catch {
            // raw text
          }

          resolve({
            success: true,
            targetUrl: targetUrl.toString(),
            statusCode: res.statusCode,
            headers: res.headers,
            durationMs,
            body: parsedJson !== null ? parsedJson : rawResponse
          });
        });
      });

      req.on('error', (err) => {
        resolve({
          success: false,
          targetUrl: targetUrl.toString(),
          error: err.message,
          durationMs: Date.now() - startTime
        });
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }
}
