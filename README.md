# VaultLog — Zero-Dependency Embedded Key-Value Store

> A practical persistent key-value storage engine built from scratch using Go's standard library. Zero third-party dependencies.

## Problem

Embedded databases and key-value stores often rely on external packages or pre-built storage engines. This can increase dependency complexity and make the underlying storage layer harder to inspect and understand.

VaultLog explores how far a practical embedded key-value store can go using only Go's standard library.

## Solution

VaultLog is a persistent embedded key-value store based on an append-only log and an in-memory index.

It provides:

* Persistent key-value storage
* Append-only storage log
* In-memory hash indexing
* Restart recovery through log replay
* Data integrity checks using CRC32
* Thread-safe operations
* Simple CLI commands
* Zero third-party runtime dependencies

## Architecture

```text
                    VaultLog
                       │
              ┌────────┴────────┐
              │                 │
       In-Memory Index     Append-Only Log
              │                 │
              │                 ▼
              │          Persistent File
              │
              ▼
        Fast Key Lookup
```

### Write Flow

```text
Put(key, value)
      ↓
Encode Record
      ↓
Append to Log
      ↓
Update Index
```

### Recovery Flow

```text
Persistent Log
      ↓
Read Records
      ↓
Validate Records
      ↓
Replay Operations
      ↓
Rebuild Index
```

## Features

### Persistent Storage

Data is stored on disk through an append-only log rather than being kept only in memory.

### In-Memory Index

An in-memory hash map provides fast average-case key lookups without scanning the entire log.

### Recovery

On startup, VaultLog replays the storage log and reconstructs the current state.

### Integrity Checks

Records include CRC32 checksums to detect corrupted data during recovery.

### Concurrency

Access to the storage engine is protected using Go's standard synchronization primitives.

### CLI

VaultLog supports core operations such as:

```text
set
get
delete
list
stats
```

## Tech Stack

**Language:** Go 1.27

**Standard Library:**

* `os` — file and filesystem operations
* `io` — file and stream handling
* `sync` — concurrency control
* `encoding/binary` — binary record encoding
* `encoding/json` — serialization
* `hash/crc32` — integrity checks
* `path/filepath` — filesystem paths
* `flag` — command-line parsing
* `testing` — automated tests

**Third-party runtime dependencies: 0**

## Quick Start

### Requirements

Go 1.27+

### Build

```bash
go build -o vaultlog .
```

### Run

```bash
./vaultlog
```

## Testing

VaultLog uses Go's built-in testing framework.

```bash
go test ./...
```

Tests cover storage operations, persistence, recovery, integrity validation, concurrency, and edge cases.

## Zero-Dependency Verification

Check the module dependency graph:

```bash
go mod graph
```

Check the complete dependency tree:

```bash
go list -deps ./...
```

VaultLog contains no third-party runtime dependencies.

## Standard Library Replacements

| Normally Used              | VaultLog Uses                          |
| -------------------------- | -------------------------------------- |
| `google/uuid`              | Go standard library UUID functionality |
| `testify`                  | `testing`                              |
| `logrus` / `zap`           | `log` / `log/slog`                     |
| External file utilities    | `os` / `io`                            |
| External binary encoders   | `encoding/binary`                      |
| External hashing utilities | `hash/crc32`                           |
| External CLI parsers       | `flag`                                 |
| External path utilities    | `path/filepath`                        |

See [`STDLIB.md`](STDLIB.md) for the complete dependency replacement log.

## Limitations

* Designed for embedded, single-process use
* In-memory index requires RAM proportional to the number of indexed keys
* Append-only storage requires eventual log compaction
* No SQL/query language
* No distributed replication
* Not intended to replace full production database systems

## License

MIT
