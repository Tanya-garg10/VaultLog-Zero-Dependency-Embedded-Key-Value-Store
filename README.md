# VaultLog — Zero-Dependency Embedded Key-Value Store

> **A practical key-value storage engine, built from scratch with Go's standard library. Zero dependencies.**

---

## 💡 The Problem
Embedded databases and key-value stores often require heavy external dependencies or complex build processes:
- Popular embedded databases (SQLite, BadgerDB, BoltDB) require CGO, external dependencies, or complex build toolchains.
- In-memory stores lack persistence and crash recovery capabilities.
- In restricted environments (air-gapped systems, secure enterprise CI/CD runners, locked-down edge nodes), installing external Go packages creates supply-chain vulnerabilities.
- Many key-value stores sacrifice simplicity for features, making them difficult to understand and audit.

## 🚀 The Solution
**VaultLog** is a persistent embedded key-value store built entirely with Go 1.27 standard library:
1. **Append-Only Log Storage**: Write-Ahead Log (WAL) architecture for durability and crash recovery.
2. **In-Memory Indexing**: Fast read operations with hash-based in-memory index.
3. **Crash/Restart Recovery**: Automatic recovery from unclean shutdowns using log replay.
4. **Zero Third-Party Dependencies**: Built exclusively with Go standard library packages.
5. **Simple API**: Clean, intuitive interface for common key-value operations.

---

## 🛡️ Why Zero Dependency?
- **Zero Supply Chain Risk**: Zero threat of typosquatting, hijacked upstream packages, or compromised telemetry scripts.
- **Instant Cold Starts**: Fast startup with minimal memory footprint.
- **Portability**: Runs on any system with Go 1.27 installed without external dependencies.
- **Longevity**: Standard library APIs are stable for decades.

---

## ✨ Features

- **Append-Only Write-Ahead Log**: Durable storage with append-only operations for data integrity.
- **In-Memory Hash Index**: Fast O(1) read operations using in-memory hash map.
- **Automatic Crash Recovery**: Log replay mechanism to recover from unclean shutdowns.
- **Simple Key-Value API**: Intuitive Put, Get, Delete operations with type-safe values.
- **Concurrent Access**: Thread-safe operations using Go's sync primitives.
- **Compact Storage**: Efficient binary encoding for minimal disk usage.
- **Zero External Dependencies**: Built entirely with Go standard library packages.

---

## 🏗️ Architecture

```
                               ┌──────────────────────────────────────────────┐
                               │              VaultLog Engine                  │
                               │         (Go 1.27 Standard Library)           │
                               └──────────────────────┬───────────────────────┘
                                                      │
                       ┌──────────────────────────────┴──────────────────────────────┐
                       │                                                             │
            ┌──────────▼──────────┐                                       ┌──────────▼──────────┐
            │   In-Memory Index   │                                       │   Write-Ahead Log   │
            │   (Hash Map)        │                                       │   (Append-Only)     │
            │   Fast O(1) Reads   │                                       │   Persistent Storage │
            └──────────┬──────────┘                                       └──────────┬──────────┘
                       │                                                             │
     ┌─────────────────┼─────────────────┐                                           │
     │                 │                 │                                           │
┌────▼────────┐ ┌──────▼───────┐ ┌───────▼────────┐                                  │
│   Put/Get   │ │   Delete     │ │   Recovery     │                                  │
│   Operations│ │   Operations │ │   Engine       │                                  │
│(API Layer)  │ │(API Layer)   │ │(Log Replay)    │                                  │
└────┬────────┘ └──────┬───────┘ └────────────────┘                                  │
     │                 │                                                             │
     └────────┬────────┘                                                             │
              │                                                                      │
     ┌────────▼────────────────┐                                                     │
     │   Sync Primitives       │◄────────────────────────────────────────────────────┘
     │   (Mutex/RWMutex)       │
     │   Thread-Safe Access    │
     └─────────────────────────┘
```

---

## 🧰 Tech Stack
- **Runtime**: Go 1.27
- **Standard Library Packages**:
  - `os` & `io` (File I/O, persistent storage)
  - `sync` (Mutex, RWMutex for thread-safe operations)
  - `encoding/binary` (Efficient binary encoding)
  - `encoding/json` (JSON serialization)
  - `hash/crc32` (Data integrity checksums)
  - `path/filepath` (Safe path operations)
  - `testing` (Native test runner)
- **Third-Party Dependencies**: **`0`**

---

## 📦 Installation & Quick Start

### 1. Build and Run
```bash
go build -o vaultlog
./vaultlog
```

### 2. Use as a Library
```go
import "github.com/Tanya-garg10/VaultLog"

db, err := vaultlog.Open("data.db")
if err != nil {
    log.Fatal(err)
}
defer db.Close()

db.Put("key", []byte("value"))
value, err := db.Get("key")
```

---

## 🧪 Testing

Run the full automated test suite using Go's native test runner:
```bash
go test ./...
```
The suite executes comprehensive tests covering:
- Basic Put/Get/Delete operations
- Crash recovery and log replay
- Concurrent access patterns
- Data integrity and checksums
- Performance benchmarks

---

## 🔒 Dependency Proof & Audit
Verify zero external dependencies:
```bash
go mod graph
```
Output:
```
github.com/Tanya-garg10/VaultLog
```
No external dependencies - only Go standard library packages used.

---

## ⚠️ Known Boundaries & Limitations
- **Single-Node Storage**: Designed for single-node embedded use cases, not distributed systems.
- **Append-Only Log**: Log files grow over time and require periodic compaction.
- **In-Memory Index**: The index is kept in memory, so very large datasets may require significant RAM.
- **Go 1.27+**: Requires Go 1.27 or later for standard library compatibility.

---

## 🎯 Quick Demo

1. **Build the Database**: Run `go build -o vaultlog && ./vaultlog`
2. **Store Data**: Use the API to store key-value pairs
3. **Simulate Crash**: Kill the process and restart to see automatic recovery
4. **Verify Integrity**: Run `go test ./...` to verify data integrity
