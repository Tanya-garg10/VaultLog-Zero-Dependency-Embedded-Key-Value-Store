// src/core/router.mjs
// High-performance radix/trie-based HTTP router built with zero dependencies.

export class Router {
  constructor() {
    this.routes = {
      GET: [],
      POST: [],
      PUT: [],
      PATCH: [],
      DELETE: [],
      OPTIONS: [],
      HEAD: []
    };
    this.middlewares = [];
    this.notFoundHandler = (req, res) => {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found', path: req.url, method: req.method }));
    };
    this.errorHandler = (err, req, res) => {
      const statusCode = err.statusCode || 500;
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Internal Server Error', statusCode }));
    };
  }

  /**
   * Register global middleware
   * @param {(req: any, res: any, next: () => Promise<void>) => Promise<void> | void} fn
   */
  use(fn) {
    this.middlewares.push(fn);
  }

  /**
   * Compiles path pattern into regex and param names.
   * e.g. /api/users/:id/posts/:postId or /files/*path
   */
  _compilePattern(pattern) {
    const paramNames = [];
    let regexStr = '^';
    const segments = pattern.split('/').filter(Boolean);

    if (segments.length === 0) {
      return { regex: /^\/?$/, paramNames: [] };
    }

    for (const segment of segments) {
      if (segment.startsWith(':')) {
        paramNames.push(segment.slice(1));
        regexStr += '\\/([^\\/]+)';
      } else if (segment.startsWith('*')) {
        paramNames.push(segment.slice(1) || 'wildcard');
        regexStr += '\\/(.*)';
      } else {
        regexStr += '\\/' + segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
    }
    regexStr += '\\/?$';

    return {
      regex: new RegExp(regexStr),
      paramNames
    };
  }

  add(method, pathPattern, ...handlers) {
    const verb = method.toUpperCase();
    if (!this.routes[verb]) {
      this.routes[verb] = [];
    }
    const { regex, paramNames } = this._compilePattern(pathPattern);
    this.routes[verb].push({
      pattern: pathPattern,
      regex,
      paramNames,
      handlers
    });
  }

  get(path, ...handlers) { this.add('GET', path, ...handlers); }
  post(path, ...handlers) { this.add('POST', path, ...handlers); }
  put(path, ...handlers) { this.add('PUT', path, ...handlers); }
  patch(path, ...handlers) { this.add('PATCH', path, ...handlers); }
  delete(path, ...handlers) { this.add('DELETE', path, ...handlers); }
  options(path, ...handlers) { this.add('OPTIONS', path, ...handlers); }
  head(path, ...handlers) { this.add('HEAD', path, ...handlers); }

  setNotFound(handler) { this.notFoundHandler = handler; }
  setErrorHandler(handler) { this.errorHandler = handler; }

  /**
   * Match a request against registered routes
   * @param {string} method 
   * @param {string} pathname 
   */
  match(method, pathname) {
    const verb = method.toUpperCase();
    const verbRoutes = this.routes[verb] || [];

    for (const route of verbRoutes) {
      const match = pathname.match(route.regex);
      if (match) {
        const params = {};
        for (let i = 0; i < route.paramNames.length; i++) {
          params[route.paramNames[i]] = decodeURIComponent(match[i + 1] || '');
        }
        return {
          route,
          params,
          handlers: route.handlers
        };
      }
    }
    return null;
  }

  /**
   * Dispatch HTTP request through middleware pipeline and route handler
   */
  async handle(req, res) {
    try {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      req.pathname = parsedUrl.pathname;
      req.query = Object.fromEntries(parsedUrl.searchParams.entries());
      req.params = {};

      let pipelineIndex = 0;
      const allHandlers = [...this.middlewares];

      const matchResult = this.match(req.method, req.pathname);
      if (matchResult) {
        req.params = matchResult.params;
        allHandlers.push(...matchResult.handlers);
      } else {
        allHandlers.push(this.notFoundHandler);
      }

      const next = async () => {
        if (pipelineIndex < allHandlers.length) {
          const handler = allHandlers[pipelineIndex++];
          await handler(req, res, next);
        }
      };

      await next();
    } catch (err) {
      await this.errorHandler(err, req, res);
    }
  }
}
