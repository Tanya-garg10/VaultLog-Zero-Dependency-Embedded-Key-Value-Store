// src/export/generator.mjs
// OpenAPI 3.0.3, Postman Collection v2.1, and HAR 1.2 Exporters (Zero Dependencies).

import { inferSchema } from '../schema/validator.mjs';

/**
 * Generates an OpenAPI 3.0.3 JSON specification document
 */
export function generateOpenApiSpec(mockEngine, appUrl = 'http://localhost:3000') {
  const routes = mockEngine.getRoutes();
  const collections = mockEngine.getCollections();

  const paths = {};

  // 1. Process custom mock routes
  for (const route of routes) {
    // Convert /api/users/:id to /api/users/{id}
    const openApiPath = route.path.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');
    if (!paths[openApiPath]) {
      paths[openApiPath] = {};
    }

    const methodLower = route.method.toLowerCase();
    const pathParams = (route.path.match(/:([a-zA-Z0-9_]+)/g) || []).map(p => ({
      name: p.slice(1),
      in: 'path',
      required: true,
      schema: { type: 'string' }
    }));

    const operation = {
      summary: route.name,
      description: `Simulated latency: ${route.latencyMs}ms, error rate: ${route.errorRate}%`,
      parameters: pathParams,
      responses: {
        [String(route.status)]: {
          description: `Default Mock Response (${route.status})`,
          content: {
            'application/json': {
              schema: inferSchema(route.responseBody),
              example: route.responseBody
            }
          }
        }
      }
    };

    if (route.schema && (route.method === 'POST' || route.method === 'PUT' || route.method === 'PATCH')) {
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: route.schema
          }
        }
      };
    }

    paths[openApiPath][methodLower] = operation;
  }

  // 2. Process dynamic collection endpoints
  for (const [colName, info] of Object.entries(collections)) {
    const listPath = `/api/collections/${colName}`;
    const itemPath = `/api/collections/${colName}/{id}`;

    paths[listPath] = {
      get: {
        summary: `List ${colName} (with filtering, sorting, pagination)`,
        parameters: [
          { name: '_page', in: 'query', schema: { type: 'integer' }, description: 'Page number' },
          { name: '_limit', in: 'query', schema: { type: 'integer' }, description: 'Items per page' },
          { name: '_sort', in: 'query', schema: { type: 'string' }, description: 'Field to sort by' },
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Full-text search query' }
        ],
        responses: {
          '200': {
            description: `List of ${colName}`,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: inferSchema(info.sample[0] || {}) },
                    meta: { type: 'object' }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        summary: `Create item in ${colName}`,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: inferSchema(info.sample[0] || {})
            }
          }
        },
        responses: {
          '201': { description: 'Item created' }
        }
      }
    };

    paths[itemPath] = {
      get: {
        summary: `Get single ${colName} by ID`,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Item found' },
          '404': { description: 'Item not found' }
        }
      },
      patch: {
        summary: `Update single ${colName} by ID`,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Item updated' }
        }
      },
      delete: {
        summary: `Delete single ${colName} by ID`,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Item deleted' }
        }
      }
    };
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'WireForge Zero Generated API Specification',
      version: '1.0.0',
      description: 'Auto-generated zero-dependency OpenAPI 3.0 specification from active mocks and collections.'
    },
    servers: [
      { url: appUrl, description: 'WireForge Zero Server' }
    ],
    paths
  };
}

/**
 * Generates Postman Collection v2.1.0 format
 */
export function generatePostmanCollection(mockEngine, appUrl = 'http://localhost:3000') {
  const routes = mockEngine.getRoutes();
  const items = [];

  for (const route of routes) {
    items.push({
      name: `${route.method} ${route.path} - ${route.name}`,
      request: {
        method: route.method,
        header: Object.entries(route.headers || {}).map(([key, value]) => ({ key, value, type: 'text' })),
        url: {
          raw: `{{baseUrl}}${route.path}`,
          host: ['{{baseUrl}}'],
          path: route.path.split('/').filter(Boolean)
        },
        body: route.method !== 'GET' ? {
          mode: 'raw',
          raw: JSON.stringify(route.schema ? { sample: 'payload' } : {}, null, 2),
          options: { raw: { language: 'json' } }
        } : undefined
      },
      response: [
        {
          name: `Sample Response (${route.status})`,
          status: 'OK',
          code: route.status,
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: JSON.stringify(route.responseBody, null, 2)
        }
      ]
    });
  }

  return {
    info: {
      name: 'WireForge Zero API Collection',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    variable: [
      { key: 'baseUrl', value: appUrl, type: 'string' }
    ],
    item: items
  };
}

/**
 * Generates HTTP Archive (HAR 1.2) log from recorded traffic entries
 */
export function generateHARLog(trafficEntries, appUrl = 'http://localhost:3000') {
  const entries = trafficEntries.map(entry => {
    const reqHeaders = Object.entries(entry.headers || {}).map(([name, value]) => ({ name, value: String(value) }));
    const resHeaders = Object.entries(entry.response?.headers || {}).map(([name, value]) => ({ name, value: String(value) }));

    const reqBodyText = typeof entry.body === 'object' ? JSON.stringify(entry.body) : String(entry.body || '');
    const resBodyText = typeof entry.response?.body === 'object' ? JSON.stringify(entry.response.body) : String(entry.response?.body || '');

    return {
      startedDateTime: entry.timestamp,
      time: entry.response?.durationMs || 10,
      request: {
        method: entry.method,
        url: entry.url ? entry.url : `${appUrl}${entry.path}`,
        httpVersion: 'HTTP/1.1',
        headers: reqHeaders,
        queryString: Object.entries(entry.query || {}).map(([name, value]) => ({ name, value: String(value) })),
        postData: reqBodyText ? {
          mimeType: entry.headers['content-type'] || 'application/json',
          text: reqBodyText
        } : undefined,
        headersSize: -1,
        bodySize: Buffer.byteLength(reqBodyText)
      },
      response: {
        status: entry.response?.statusCode || 200,
        statusText: entry.response?.statusCode === 200 ? 'OK' : 'Status',
        httpVersion: 'HTTP/1.1',
        headers: resHeaders,
        content: {
          size: Buffer.byteLength(resBodyText),
          mimeType: 'application/json',
          text: resBodyText
        },
        headersSize: -1,
        bodySize: Buffer.byteLength(resBodyText)
      },
      cache: {},
      timings: {
        send: 1,
        wait: Math.max(1, (entry.response?.durationMs || 10) - 2),
        receive: 1
      }
    };
  });

  return {
    log: {
      version: '1.2',
      creator: { name: 'WireForge Zero', version: '1.0.0' },
      entries
    }
  };
}
