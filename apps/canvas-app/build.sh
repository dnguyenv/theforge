#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Building The Forge Canvas App..."

# Build WASM bridge
source "$HOME/.cargo/env" 2>/dev/null || true
wasm-pack build "$PROJECT_ROOT/crates/forge-wasm-bridge" \
    --target web \
    --out-dir "$SCRIPT_DIR/pkg"

echo ""
echo "Build complete. Serve with:"
echo "  python3 -m http.server 8080 --directory $SCRIPT_DIR"
echo ""
echo "Then open http://localhost:8080"
