# An Tam Art — iOS App

Native iOS wrapper for the An Tam Art canvas application using Capacitor.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  iOS App Shell                        │
│  (Swift/UIKit via Capacitor)                         │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Native Plugins (Swift)                          │ │
│  │  • ApplePencilPlugin — low-latency drawing      │ │
│  │  • DrawingViewPlugin — lifecycle, safe area     │ │
│  │  • Capacitor/Haptics — tactile feedback         │ │
│  │  • Capacitor/Filesystem — offline persistence   │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │ WKWebView (iOS 16+)                             │ │
│  │                                                  │ │
│  │  ┌───────────────────────────────────────────┐  │ │
│  │  │ Canvas App (www/)                          │  │ │
│  │  │  • HTML5 Canvas (2D context)               │  │ │
│  │  │  • WASM Bridge (Forge Protocol)            │  │ │
│  │  │  • ES6 Modules (vanilla JS)               │  │ │
│  │  │  • iOS Bridge (ios-bridge.js)              │  │ │
│  │  └───────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Setup

### Prerequisites

- macOS with Xcode 15+
- Node.js 18+
- Rust toolchain with wasm32-unknown-unknown target
- wasm-pack (`cargo install wasm-pack`)
- CocoaPods (`gem install cocoapods`)

### First Time Setup

```bash
cd apps/ios-app
./setup.sh
npx cap open ios
```

### Development Cycle

```bash
# After making changes to the web app:
npm run build
npx cap sync ios

# Open Xcode to run on device/simulator:
npx cap open ios
```

## Native Features

### Apple Pencil Support
- Low-latency drawing via WKWebView configuration
- Full pressure/tilt data available through standard Pointer Events
- Palm rejection handled by iOS (WKWebView standard behavior)

### Haptic Feedback
- Light: tool selection, color pick confirmation
- Medium: page flip completion
- Heavy: session export

### Offline Mode
- Canvas state auto-saved to IndexedDB (within WKWebView)
- Works fully offline (WASM runs client-side, no server needed)
- Collaboration features gracefully degrade when offline

### App Lifecycle
- Saves drawing state when app backgrounds (via `appWillResignActive` listener)
- Restores when returning to foreground
- Screen stays awake during drawing sessions

### Safe Area
- Dynamically adjusts UI for notch/Dynamic Island
- CSS custom properties: `--safe-area-top`, `--safe-area-bottom`

## File Structure

```
apps/ios-app/
  package.json          — npm deps (Capacitor + plugins)
  capacitor.config.ts   — iOS-specific Capacitor configuration
  ios-bridge.js         — JS↔Native communication layer
  ios-plugins/
    ApplePencilPlugin.swift  — Apple Pencil configuration
    DrawingViewPlugin.swift  — WebView optimization + lifecycle
  setup.sh              — One-command setup
  www/                  — (generated) Web app copy for embedding
  ios/                  — (generated) Xcode project
```

## Performance Notes

- WKWebView on iOS supports WebAssembly with JIT (full speed)
- Canvas 2D operations are GPU-accelerated on iOS
- OffscreenCanvas is supported on iOS 16.4+
- Memory: each layer uses ~8MB (1920x1080 RGBA). Cap at 50 layers on iPad.
- The Forge Protocol WASM binary is 148KB (loaded once, cached)

## Deployment

1. Set up Apple Developer account
2. Configure signing in Xcode
3. Archive → Distribute → App Store Connect
4. Or TestFlight for beta testing
