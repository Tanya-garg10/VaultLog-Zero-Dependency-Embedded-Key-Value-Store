// src/storage/wal.mjs
// Append-Only Write-Ahead Log (WAL) Engine for crash-resilient persistence with zero dependencies.

import { promises as fs, existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

export class WalStorage {
  /**
   * @param {string} logFilePath 
   */
  constructor(logFilePath = './data/wireforge.wal') {
    this.logFilePath = logFilePath;
    this.stream = null;
    this.stats = {
      appendedCount: 0,
      recoveredCount: 0,
      corruptedSkipped: 0,
      lastCompacted: null
    };
  }

  async init() {
    const dir = dirname(this.logFilePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Appends an event to the WAL with SHA-256 integrity checksum.
   * @param {string} type 
   * @param {any} payload 
   */
  async append(type, payload) {
    const dir = dirname(this.logFilePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const record = {
      t: Date.now(),
      type,
      payload
    };
    const jsonStr = JSON.stringify(record);
    const checksum = createHash('sha256').update(jsonStr).digest('hex');
    const line = `${checksum}|${jsonStr}\n`;

    try {
      await fs.appendFile(this.logFilePath, line, 'utf-8');
      this.stats.appendedCount++;
      return true;
    } catch (err) {
      console.error('[WAL] Append failure:', err.message);
      return false;
    }
  }

  /**
   * Replays WAL log from disk, validating line checksums.
   * @param {(type: string, payload: any) => void} applyCallback 
   */
  async recover(applyCallback) {
    if (!existsSync(this.logFilePath)) {
      return this.stats;
    }

    try {
      const content = await fs.readFile(this.logFilePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const pipeIdx = line.indexOf('|');
        if (pipeIdx === -1) {
          this.stats.corruptedSkipped++;
          continue;
        }

        const recordedChecksum = line.substring(0, pipeIdx);
        const jsonStr = line.substring(pipeIdx + 1);

        const computedChecksum = createHash('sha256').update(jsonStr).digest('hex');
        if (recordedChecksum !== computedChecksum) {
          console.warn(`[WAL] Checksum mismatch at line ${i + 1}. Skipping corrupted entry.`);
          this.stats.corruptedSkipped++;
          continue;
        }

        try {
          const entry = JSON.parse(jsonStr);
          applyCallback(entry.type, entry.payload);
          this.stats.recoveredCount++;
        } catch {
          this.stats.corruptedSkipped++;
        }
      }
    } catch (err) {
      console.error('[WAL] Recovery read failure:', err.message);
    }

    return this.stats;
  }

  /**
   * Compacts WAL log by writing full state snapshot and truncating log.
   * @param {any} snapshotState 
   */
  async compact(snapshotState) {
    const snapshotPath = `${this.logFilePath}.snapshot.json`;
    const tempPath = `${this.logFilePath}.tmp`;

    try {
      // 1. Write snapshot
      await fs.writeFile(snapshotPath, JSON.stringify(snapshotState, null, 2), 'utf-8');

      // 2. Truncate WAL to fresh state
      await fs.writeFile(tempPath, '', 'utf-8');
      await fs.rename(tempPath, this.logFilePath);

      this.stats.lastCompacted = new Date().toISOString();
      return true;
    } catch (err) {
      console.error('[WAL] Compaction failure:', err.message);
      return false;
    }
  }

  /**
   * Clears WAL log (for tests)
   */
  async clear() {
    try {
      if (existsSync(this.logFilePath)) {
        await fs.unlink(this.logFilePath);
      }
    } catch {
      // ignore
    }
  }
}
