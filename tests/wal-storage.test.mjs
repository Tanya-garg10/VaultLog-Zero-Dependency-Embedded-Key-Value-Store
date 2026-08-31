// tests/wal-storage.test.mjs
// Unit tests for Write-Ahead Log (WAL) Storage, Checksums, and Crash Recovery.

import test from 'node:test';
import assert from 'node:assert/strict';
import { WalStorage } from '../src/storage/wal.mjs';
import { promises as fs } from 'node:fs';

const TEST_WAL_PATH = './data/test_wal.log';

test('WAL: Append and sequential crash recovery', async () => {
  const wal = new WalStorage(TEST_WAL_PATH);
  await wal.init();
  await wal.clear();

  // 1. Append records
  await wal.append('ROUTE_UPSERT', { id: 'r1', path: '/test1' });
  await wal.append('ROUTE_UPSERT', { id: 'r2', path: '/test2' });
  await wal.append('COLLECTION_INSERT', { collection: 'users', item: { id: 'u1', name: 'Alex' } });

  // 2. Recover into fresh state
  const recoveredEvents = [];
  const walRecovery = new WalStorage(TEST_WAL_PATH);
  const stats = await walRecovery.recover((type, payload) => {
    recoveredEvents.push({ type, payload });
  });

  assert.equal(stats.recoveredCount, 3);
  assert.equal(stats.corruptedSkipped, 0);
  assert.equal(recoveredEvents.length, 3);
  assert.equal(recoveredEvents[0].payload.id, 'r1');
  assert.equal(recoveredEvents[2].payload.item.name, 'Alex');

  await wal.clear();
});

test('WAL: Corrupted and truncated entry handling with checksum verification', async () => {
  const wal = new WalStorage(TEST_WAL_PATH);
  await wal.init();
  await wal.clear();

  // Write a valid entry
  await wal.append('VALID_EVENT_1', { msg: 'first' });

  // Manually inject a corrupted line with invalid checksum
  const corruptedLine = `bad_checksum_hash_12345|{"t":1234,"type":"HACKED","payload":{"msg":"fake"}}\n`;
  await fs.appendFile(TEST_WAL_PATH, corruptedLine, 'utf-8');

  // Write another valid entry
  await wal.append('VALID_EVENT_2', { msg: 'second' });

  const recoveredEvents = [];
  const walRecovery = new WalStorage(TEST_WAL_PATH);
  const stats = await walRecovery.recover((type, payload) => {
    recoveredEvents.push({ type, payload });
  });

  assert.equal(stats.recoveredCount, 2);
  assert.equal(stats.corruptedSkipped, 1);
  assert.equal(recoveredEvents[0].type, 'VALID_EVENT_1');
  assert.equal(recoveredEvents[1].type, 'VALID_EVENT_2');

  await wal.clear();
});

test('WAL: Compaction snapshot generation', async () => {
  const wal = new WalStorage(TEST_WAL_PATH);
  await wal.init();
  await wal.clear();

  await wal.append('EVENT', { count: 1 });
  await wal.append('EVENT', { count: 2 });

  const compacted = await wal.compact({ totalRoutes: 2, users: 10 });
  assert.equal(compacted, true);

  const snapshotContent = await fs.readFile(`${TEST_WAL_PATH}.snapshot.json`, 'utf-8');
  const snapshotObj = JSON.parse(snapshotContent);
  assert.equal(snapshotObj.totalRoutes, 2);

  await wal.clear();
  try { await fs.unlink(`${TEST_WAL_PATH}.snapshot.json`); } catch {}
});
