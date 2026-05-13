# The Forge Protocol - Technical Design

## 1. Tech Stack

| Component | Language | Key Libraries |
|-----------|----------|---------------|
| Anvil (Edge Daemon) | Rust | tokio, tonic, crossbeam, rusqlite, wasmtime |
| Forge-Observer (gRPC) | Rust | tonic + prost |
| Forge-Crypto (Signing) | Rust | ring (Ed25519), security-framework (Apple SE) |
| Forge-Merkle | Rust | ring::digest (SHA-256) |
| Armorer (Analysis) | Rust | statrs, ndarray |
| Beskar Export (C2PA) | Rust | c2pa-rs |
| Foundry-Sync (Ledger) | Rust | reqwest (Arweave HTTP) |
| Build/CI | Cargo workspaces | cargo-nextest, criterion, proptest |

## 2. Design Patterns

### 2.1 Event Sourcing

Every Strike is an immutable event appended to an ordered log. The SQLite event store is append-only. Current state (session progress, Merkle tree) is derived by replaying events. This provides a complete audit trail required for proof-of-process, deterministic replay for verification, and a natural fit for Merkle tree construction where leaves equal events.

### 2.2 CQRS

- **Write path:** Host-app plugin -> Forge-Observer gRPC -> Event Bus -> Event Store + Merkle Tree
- **Read path:** CLI/Verifier -> Session Store -> Purity Analysis

The write path is optimized for throughput (lock-free ring buffer, batch SQLite writes). The read path tolerates higher latency and operates on materialized views.

### 2.3 Actor Model

Each active session runs as a lightweight Tokio task that owns its Merkle tree state, heartbeat timer, and event sequence counter. Messages pass via bounded `mpsc` channels.

### 2.4 Trait-Based Dependency Inversion

Key interfaces are defined as traits, enabling testing without hardware:

```rust
pub trait SigningProvider: Send + Sync {
    fn sign(&self, payload: &[u8]) -> Result<Vec<u8>, CryptoError>;
    fn public_key(&self) -> &[u8];
    fn algorithm(&self) -> SignatureAlgorithm;
    fn did(&self) -> &str;
    fn verify(&self, payload: &[u8], signature: &[u8]) -> Result<bool, CryptoError>;
}
```

### 2.5 Wasm Plugin Sandboxing

Host-app adapters run as Wasm modules inside wasmtime. This provides memory isolation, capability-based security, hot-reloading without daemon restart, and language agnosticism.

## 3. Data Flow

### 3.1 Strike Capture to Merkle Tree

```
[Host App (Photoshop/Blender/VSCode)]
        |
        |  Wasm Plugin or System Hook
        v
[Forge-Observer gRPC Service]
        |
        |  Validates, normalizes, assigns sequence_id
        v
[Event Bus (lock-free ring buffer)]
        |
        +------------------------------+
        |                              |
        v                              v
[SQLite Event Store]         [Session Actor]
  (append-only)                    |
                                   |  Computes delta_hash, appends leaf
                                   v
                             [Incremental Merkle Tree]
                                   |
                                   |  Every N events or heartbeat
                                   v
                             [Sync Queue (SQLite)]
                                   |
                                   v
                             [Arweave / Private Ledger]
```

### 3.2 Session Lifecycle

```
[Init] --sign_chain_code--> [Active]
                               |
                  heartbeat    |    user_pause
                  every 5min   |        |
                               |        v
                               |    [Paused]
                               |        |
                               |   resume|
                               |<--------+
                               |
                          export/close
                               |
                               v
                          [Closing]
                               |
                    finalize_merkle_root
                    sign_session_summary
                               |
                               v
                          [Closed]
```

### 3.3 Beskar Export (C2PA)

```
[User triggers export]
        |
        v
[Session Actor: finalize Merkle root]
        |
        v
[Armorer: compute Purity Grade]
        |
        v
[Beskar Export Module]
        |-- Create C2PA Builder
        |-- Add action: "c2pa.created"
        |-- Add assertion: "forge.purity_grade"
        |-- Add assertion: "forge.merkle_proof"
        |-- Add assertion: "forge.chain_code"
        |-- Sign manifest (SigningProvider)
        |-- Embed JUMBF into file
        |
        v
[Output: file with embedded C2PA manifest]
```

## 4. Security Model

### 4.1 Key Hierarchy

```
+-------------------------------------------+
|       HARDWARE SECURE ENCLAVE             |
|                                           |
|  Root Identity Key (never exported)       |
|  Algorithm: P-256 (Apple) / RSA (TPM)     |
+--------------------+----------------------+
                     | signs
                     v
       +----------------------------+
       |  Session Signing Key       |
       |  Ed25519, derived per      |
       |  session, stored encrypted |
       +-------------+--------------+
                     | signs
                     v
            +------------------+
            |  Strike Events   |
            |  (delta_hash +   |
            |   EdDSA sig)     |
            +------------------+
```

### 4.2 Tamper Resistance

| Threat | Mitigation |
|--------|-----------|
| Event injection | Each event signed; sequence_id monotonic; delta_hash chains |
| Event deletion | Merkle tree detects gaps; roots synced to ledger |
| Time manipulation | Monotonic clock + heartbeat witnesses |
| Key extraction | Secure Enclave non-exportable; software fallback encrypts at rest |
| Replay attack | Session ID + sequence_id + timestamp uniqueness |
| MITM (gRPC) | mTLS between plugin and Anvil |
| SQLite tampering | HMAC over pages or SQLCipher |

### 4.3 DID Method

```
did:forge:<base58(sha256(public_key_bytes))>
```

## 5. AI/ML Integration (The Armorer)

### 5.1 Feature Extraction

For a sliding window of N events (default N=500, overlap 50%):

| Feature | What It Detects |
|---------|-----------------|
| Shannon Entropy | Low entropy = repetitive/automated |
| Hurst Exponent (R/S analysis) | H~0.5 = random (human), H~1.0 = persistent (scripted) |
| Timing Jitter (CV) | CV < 0.05 = machine-precision timing |
| Pressure Variance | Zero variance = mouse/automated |
| Velocity Autocorrelation | High = linear automation |
| Action Transition Entropy | Low = repetitive workflow |
| Pause Distribution | Human: log-normal. Bot: uniform |
| Burst Density Variance | Human: variable. Bot: constant rate |

### 5.2 Purity Grades

| Grade | Score | Meaning |
|-------|-------|---------|
| Masterwork | >= 0.95 | Overwhelmingly human-authored |
| Hand-Forged | 0.80 - 0.95 | Primarily human, minor tool assist |
| Assisted | 0.50 - 0.80 | Significant AI/automation |
| Synthetic | < 0.50 | Predominantly machine-generated |

### 5.3 Anti-Spoofing

- Timing injection detection (statistical test for artificial noise)
- Behavioral continuity (cross-session fingerprinting)
- Heartbeat integrity (gaps without Rest markers reduce grade)
- Hardware attestation (Secure Enclave binding)

## 6. Infrastructure

### 6.1 Local Daemon

```
+---------------------------------------------------+
|                THE ANVIL DAEMON                     |
|                                                    |
|  +------------+    +---------------------+         |
|  | gRPC Server|    | Wasm Plugin Runtime |         |
|  | (tonic)    |    | (wasmtime)          |         |
|  | :50051     |    |                     |         |
|  +------+-----+    +----------+----------+         |
|         |                     |                    |
|         +----------+----------+                    |
|                    v                               |
|         +---------------------+                    |
|         |    Event Bus        |                    |
|         |  (crossbeam)        |                    |
|         +---+--------+--------+                    |
|             |        |        |                    |
|             v        v        v                    |
|       +------+ +--------+ +--------+              |
|       |SQLite| |Session | |Heartbeat|              |
|       |Writer| |Actors  | |Timer   |              |
|       +------+ +--------+ +--------+              |
|                    |                               |
|                    v                               |
|         +---------------------+                    |
|         | Foundry-Sync Task   |                    |
|         +---------------------+                    |
+---------------------------------------------------+
```

### 6.2 Resource Constraints

- SQLite writes batched every 100ms or 100 events
- Ring buffer capacity: 16,384 events (pre-allocated)
- Merkle tree: in-memory with periodic checkpoint
- Target: <50MB RSS, <0.5% CPU at 1,000 events/sec

### 6.3 Offline Resilience

- SQLite sync_queue holds Merkle roots pending upload
- Exponential backoff retry (1s, 2s, 4s, ... 5min max)
- Queue bounded at 10,000 entries
- Batch upload on reconnection

## 7. Scalability

### 7.1 Local Throughput (>1,000 events/sec)

1. **Ring buffer:** Pre-allocated 16K slots, zero heap allocation in steady state
2. **Batch SQLite writes:** 100 events per transaction at 1K evt/s
3. **Incremental Merkle tree:** Append-only, O(log N) per insert
4. **Signature amortization:** EdDSA only on Merkle root snapshots

### 7.2 Backpressure

- 75% buffer: log warning
- 90% buffer: gRPC flow control (RESOURCE_EXHAUSTED)
- 100% buffer: drop oldest unsigned events, mark gap, purity penalty

## 8. Testing Strategy

| Layer | Tool | Scope |
|-------|------|-------|
| Unit | cargo test | Each crate in isolation |
| Property | proptest | Merkle invariants, event ordering |
| Integration | cargo-nextest | Cross-crate pipelines |
| Benchmark | criterion | Throughput at 1K, 10K, 100K evt/s |
| E2E | Custom harness | Full daemon + mock plugin |
| Fuzz | cargo-fuzz | gRPC input, malformed events |

## 9. Implementation Phases

### Phase 1: Foundation (Weeks 1-4)
- forge-crypto (SigningProvider + SoftwareSigner + Ed25519)
- forge-merkle (incremental Merkle tree + proof generation)
- forge-storage (SQLite schema + event store)
- anvil-event-bus (lock-free ring buffer)
- Proto definitions

### Phase 2: Core Daemon (Weeks 5-8)
- forge-observer (gRPC server with streaming)
- forge-session (session FSM + heartbeat)
- anvil-core (daemon binary, config, signals)
- Integration tests

### Phase 3: Analysis and Export (Weeks 9-12)
- armorer-core (entropy, Hurst, timing analysis)
- beskar-export (C2PA manifest + embedding)
- foundry-sync (Arweave transactions)

### Phase 4: Plugins and Polish (Weeks 13-16)
- Wasm SDK + example plugins
- Secure Enclave integration (Apple + TPM)
- Platform packaging
- CLI tools
