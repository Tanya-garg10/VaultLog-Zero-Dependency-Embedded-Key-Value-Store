#!/usr/bin/env node
// cli.mjs
// Command-line interface for WireForge Zero using node:util parseArgs (Zero Dependencies).

import { parseArgs } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import { validateSchema, inferSchema } from './src/schema/validator.mjs';
import { WireForgeApp } from './src/app.mjs';
import { createServer } from 'node:http';

const HELP_TEXT = `
WireForge Zero CLI - Zero-Dependency Developer API Sandbox & Tooling

USAGE:
  node cli.mjs <command> [options]

COMMANDS:
  serve                 Start the interactive HTTP server and UI (default)
  validate              Validate a JSON payload against a JSON schema file
  infer                 Infer a JSON Schema from a sample JSON file
  audit                 Run strict zero-dependency verification audit

OPTIONS:
  --port, -p <number>   Port to listen on (default: 3000)
  --host, -h <string>   Host address to bind (default: 0.0.0.0)
  --schema, -s <path>   Path to JSON Schema file (for validate)
  --data, -d <path>     Path to JSON Data file (for validate / infer)
  --help                Show this help message
  --version, -v         Show version
`;

async function run() {
  const args = process.argv.slice(2);
  const command = args[0] && !args[0].startsWith('-') ? args[0] : 'serve';

  const optionsConfig = {
    port: { type: 'string', short: 'p', default: '3000' },
    host: { type: 'string', short: 'h', default: '0.0.0.0' },
    schema: { type: 'string', short: 's' },
    data: { type: 'string', short: 'd' },
    help: { type: 'boolean' },
    version: { type: 'boolean', short: 'v' }
  };

  let parsed;
  try {
    parsed = parseArgs({
      args: command === args[0] ? args.slice(1) : args,
      options: optionsConfig,
      allowPositionals: true
    });
  } catch (err) {
    console.error(`Error: ${err.message}`);
    console.log(HELP_TEXT);
    process.exit(1);
  }

  if (parsed.values.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (parsed.values.version) {
    console.log('WireForge Zero v1.0.0 (Standard Library Only)');
    process.exit(0);
  }

  if (command === 'serve') {
    const port = parseInt(parsed.values.port, 10) || 3000;
    const host = parsed.values.host || '0.0.0.0';

    const app = new WireForgeApp();
    await app.init();

    const server = createServer((req, res) => {
      app.handleRequest(req, res);
    });

    server.listen(port, host, () => {
      console.log(`\n⚡ WireForge Zero running at http://${host}:${port}`);
    });
  } else if (command === 'validate') {
    const schemaPath = parsed.values.schema;
    const dataPath = parsed.values.data;

    if (!schemaPath || !dataPath) {
      console.error('Error: Both --schema and --data file paths are required.');
      process.exit(1);
    }

    const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    const data = JSON.parse(readFileSync(dataPath, 'utf-8'));

    const result = validateSchema(data, schema);
    if (result.valid) {
      console.log('✅ Validation PASSED! Payload strictly conforms to schema.');
      process.exit(0);
    } else {
      console.error(`❌ Validation FAILED (${result.errors.length} error(s)):`);
      for (const err of result.errors) {
        console.error(`  - [${err.path}] ${err.message}`);
      }
      process.exit(1);
    }
  } else if (command === 'infer') {
    const dataPath = parsed.values.data;
    if (!dataPath) {
      console.error('Error: --data file path is required for schema inference.');
      process.exit(1);
    }
    const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
    const schema = inferSchema(data);
    console.log(JSON.stringify(schema, null, 2));
  } else if (command === 'audit') {
    const { runAudit } = await import('./audit.mjs');
    await runAudit();
  } else {
    console.error(`Unknown command: ${command}`);
    console.log(HELP_TEXT);
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal CLI error:', err);
  process.exit(1);
});
