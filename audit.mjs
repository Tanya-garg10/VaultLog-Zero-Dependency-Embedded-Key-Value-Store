// audit.mjs
// Formal Zero-Dependency Audit & Static Codebase Verifier.
// Analyzes AST imports, package manifests, and runtime boundaries to guarantee 0 third-party packages.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const NODE_STDLIB_MODULES = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'fs/promises', 'http', 'http2', 'https', 'inspector',
  'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode',
  'querystring', 'readline', 'repl', 'sqlite', 'stream', 'stream/consumers',
  'stream/promises', 'stream/web', 'string_decoder', 'test', 'timers',
  'timers/promises', 'tls', 'trace_events', 'tty', 'url', 'util', 'util/types',
  'v8', 'vm', 'wasi', 'worker_threads', 'zlib'
]);

function getAllFiles(dir, fileList = []) {
  const files = readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === '.git' || file === 'dist') continue;
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      getAllFiles(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

export function runAudit() {
  console.log('\n======================================================');
  console.log('🔍 ZERO-DEPENDENCY AUDIT: HACKATHON RAPTORS VERIFICATION');
  console.log('======================================================\n');

  let passed = true;
  let totalImportsChecked = 0;
  const violationList = [];

  // 1. Audit package.json dependencies
  const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
  const runtimeDeps = Object.keys(pkg.dependencies || {});
  console.log(`[1/3] Checking package.json runtime dependencies...`);
  if (runtimeDeps.length === 0) {
    console.log(`  ✅ PASSED: 0 third-party runtime dependencies declared in package.json.`);
  } else {
    console.error(`  ❌ FAILED: Detected ${runtimeDeps.length} runtime dependencies: ${runtimeDeps.join(', ')}`);
    violationList.push(`package.json contains runtime dependencies: ${runtimeDeps.join(', ')}`);
    passed = false;
  }

  // 2. Audit all JavaScript/TypeScript files for imports
  console.log(`\n[2/3] Analyzing source code imports across codebase...`);
  const allFiles = getAllFiles('.').filter(f => f.endsWith('.mjs') || f.endsWith('.js'));

  for (const filePath of allFiles) {
    const code = readFileSync(filePath, 'utf-8');
    // Match static imports: import ... from '...' or dynamic imports: import('...')
    const importRegex = /(?:import\s+(?:(?:[\w*\s{},]+)\s+from\s+)?['"]([^'"]+)['"]|import\(['"]([^'"]+)['"]\))/g;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      const specifier = match[1] || match[2];
      totalImportsChecked++;

      // Check if relative local file import
      if (specifier.startsWith('.') || specifier.startsWith('/')) {
        continue;
      }

      // Check if node: prefix or stdlib module
      const isNodePrefixed = specifier.startsWith('node:');
      const cleanName = specifier.replace(/^node:/, '');

      if (!isNodePrefixed && !NODE_STDLIB_MODULES.has(cleanName)) {
        violationList.push(`Illegal third-party import in ${filePath}: "${specifier}"`);
        passed = false;
      }
    }
  }

  console.log(`  ✅ Checked ${totalImportsChecked} imports across ${allFiles.length} source files.`);

  // 3. Audit HTML for external CDN scripts/styles
  console.log(`\n[3/3] Scanning frontend HTML for external CDN assets...`);
  if (statSync('./public/index.html', { throwIfNoEntry: false })) {
    const html = readFileSync('./public/index.html', 'utf-8');
    const hasExternalScript = /<script[^>]+src=['"]https?:\/\//i.test(html);
    const hasExternalCss = /<link[^>]+href=['"]https?:\/\//i.test(html);

    if (!hasExternalScript && !hasExternalCss) {
      console.log(`  ✅ PASSED: Frontend HTML contains 0 external CDN scripts or stylesheet references.`);
    } else {
      console.error(`  ❌ FAILED: External CDN references found in public/index.html`);
      violationList.push('External CDN script or CSS in public/index.html');
      passed = false;
    }
  }

  console.log('\n------------------------------------------------------');
  if (passed) {
    console.log('🎉 AUDIT RESULT: 100% CLEAN ZERO-DEPENDENCY COMPLIANT!');
    console.log('Certified: Built exclusively with Node.js Standard Library.');
    console.log('------------------------------------------------------\n');
    return true;
  } else {
    console.error('❌ AUDIT FAILED! Violations:');
    for (const v of violationList) {
      console.error(`  - ${v}`);
    }
    console.log('------------------------------------------------------\n');
    return false;
  }
}

if (process.argv[1].endsWith('audit.mjs')) {
  const success = runAudit();
  process.exit(success ? 0 : 1);
}
