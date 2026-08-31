// server.mjs
// Entry point for WireForge Zero: Starts the Zero-Dependency HTTP Server on port 3000.

import { createServer } from 'node:http';
import { WireForgeApp } from './src/app.mjs';

const PORT = 3000;
const HOST = '0.0.0.0';

async function main() {
  const app = new WireForgeApp();
  await app.init();

  const server = createServer((req, res) => {
    app.handleRequest(req, res);
  });

  server.listen(PORT, HOST, () => {
    console.log(`
┌─────────────────────────────────────────────────────────────┐
│                   ⚡ WIREFORGE ZERO ⚡                      │
│      Zero-Dependency API Sandbox & Traffic Studio           │
├─────────────────────────────────────────────────────────────┤
│  • Local URL:      http://localhost:${PORT}                    │
│  • Network:        http://${HOST}:${PORT}                      │
│  • Runtime:        Node.js ${process.version} (STDLIB ONLY)            │
│  • Runtime Deps:   0 (Zero third-party packages)            │
│  • UI Dashboard:   http://localhost:${PORT}/                   │
│  • Live Traffic:   http://localhost:${PORT}/api/traffic/stream │
│  • OpenAPI Spec:   http://localhost:${PORT}/api/export/openapi │
└─────────────────────────────────────────────────────────────┘
`);
  });

  // Graceful shutdown handling
  const shutdown = () => {
    console.log('\n[WireForge] Shutting down gracefully...');
    server.close(() => {
      console.log('[WireForge] Server stopped. WAL flushed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[WireForge] Fatal startup error:', err);
  process.exit(1);
});
