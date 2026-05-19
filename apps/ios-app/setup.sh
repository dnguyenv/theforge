#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== An Tam Art iOS App Setup ==="
echo ""

# 1. Install npm dependencies
echo "[1/5] Installing dependencies..."
npm install

# 2. Build WASM bridge
echo "[2/5] Building WASM bridge..."
npm run build:wasm

# 3. Copy web app to www/
echo "[3/5] Copying web app to www/..."
npm run build:web

# 4. Copy iOS bridge into www
echo "[4/5] Adding iOS native bridge..."
cp ios-bridge.js www/ios-bridge.js

# 5. Add Capacitor iOS platform
echo "[5/5] Adding iOS platform..."
if [ ! -d "ios" ]; then
    npx cap add ios
fi

# Sync web content to iOS project
npx cap sync ios

echo ""
echo "=== Setup Complete ==="
echo ""
echo "To open in Xcode:"
echo "  npx cap open ios"
echo ""
echo "To update after web changes:"
echo "  npm run build && npx cap sync ios"
echo ""
echo "Manual steps in Xcode:"
echo "  1. Set your Apple Developer Team in Signing & Capabilities"
echo "  2. Copy the Swift plugins from ios-plugins/ into the Xcode project"
echo "  3. Register plugins in AppDelegate.swift"
echo ""
