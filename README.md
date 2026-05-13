# The Forge Protocol

A decentralized protocol and suite of tools designed to prove the human authorship ("Tempering") of digital creative assets through cryptographic Proof-of-Process.

## Architecture

The Forge captures atomic creative events ("Strikes") from host applications, constructs Merkle proofs of the creative process, and exports C2PA-compliant manifests ("Beskar") with purity grades.

See [DESIGN.md](./DESIGN.md) for the full technical architecture.

## Project Structure

```
crates/
  anvil-core/         Daemon binary (event capture orchestrator)
  anvil-event-bus/    Lock-free ring buffer for high-throughput events
  forge-observer/     gRPC service for host-app plugin integration
  forge-crypto/       Cryptographic signing (Secure Enclave + software fallback)
  forge-merkle/       Incremental Merkle tree construction
  forge-session/      Session lifecycle and heartbeat management
  forge-storage/      SQLite persistence layer
  armorer-core/       Purity analysis engine (entropy, Hurst exponent)
  beskar-export/      C2PA manifest injection
  foundry-sync/       Background ledger synchronization
proto/                gRPC service definitions
tools/forge-cli/      Developer CLI
```

## Getting Started

### Prerequisites

- Rust stable (1.75+)
- Protocol Buffers compiler (`protoc`)

### Build

```bash
cargo build --workspace
```

### Test

```bash
cargo test --workspace
```

### Run

```bash
cargo run -p anvil-core
```

## License

MIT OR Apache-2.0
