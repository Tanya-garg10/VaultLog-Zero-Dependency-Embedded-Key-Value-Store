// src/core/http-utils.mjs
// Zero-dependency HTTP helpers for body parsing, cookies, headers, and responses.

import { createHash } from 'node:crypto';

/**
 * Parses request body with size limits and stream handling.
 * @param {import('node:http').IncomingMessage} req 
 * @param {number} maxBytes Max allowable payload size (default: 10MB)
 * @returns {Promise<{ raw: Buffer, text: string, json: any, form: Record<string, string> | null }>}
 */
export async function parseRequestBody(req, maxBytes = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytesReceived = 0;

    req.on('data', (chunk) => {
      bytesReceived += chunk.length;
      if (bytesReceived > maxBytes) {
        req.destroy();
        const err = new Error(`Payload Too Large: exceeded limit of ${maxBytes} bytes`);
        err.statusCode = 413;
        reject(err);
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const text = raw.toString('utf-8');
      let json = null;
      let form = null;

      const contentType = (req.headers['content-type'] || '').toLowerCase();

      if (text.length > 0) {
        if (contentType.includes('application/json')) {
          try {
            json = JSON.parse(text);
          } catch {
            json = null; // Unparsed or malformed JSON
          }
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          form = {};
          const params = new URLSearchParams(text);
          for (const [k, v] of params.entries()) {
            form[k] = v;
          }
        }
      }

      resolve({ raw, text, json, form });
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Parse Cookie header into a key-value record.
 * @param {string} cookieHeader 
 * @returns {Record<string, string>}
 */
export function parseCookies(cookieHeader = '') {
  const cookies = {};
  if (!cookieHeader) return cookies;
  const pairs = cookieHeader.split(';');
  for (let pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const key = pair.substring(0, idx).trim();
    const val = pair.substring(idx + 1).trim();
    cookies[key] = decodeURIComponent(val);
  }
  return cookies;
}

/**
 * Generates an ETag for cached content.
 * @param {string | Buffer} content 
 * @returns {string}
 */
export function generateETag(content) {
  const hash = createHash('sha1').update(content).digest('hex').substring(0, 16);
  return `"${hash}"`;
}

/**
 * Sends a structured JSON response.
 * @param {import('node:http').ServerResponse} res 
 * @param {number} statusCode 
 * @param {any} data 
 * @param {Record<string, string>} extraHeaders 
 */
export function sendJson(res, statusCode, data, extraHeaders = {}) {
  const payload = JSON.stringify(data, null, 2);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Api-Key',
    ...extraHeaders
  };
  res.writeHead(statusCode, headers);
  res.end(payload);
}

/**
 * Sends a text or HTML response.
 * @param {import('node:http').ServerResponse} res 
 * @param {number} statusCode 
 * @param {string} body 
 * @param {string} contentType 
 * @param {Record<string, string>} extraHeaders 
 */
export function sendText(res, statusCode, body, contentType = 'text/plain; charset=utf-8', extraHeaders = {}) {
  const headers = {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    ...extraHeaders
  };
  res.writeHead(statusCode, headers);
  res.end(body);
}
