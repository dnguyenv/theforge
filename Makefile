.PHONY: all build test check clean wasm serve-canvas serve-timelapse ci site

all: build wasm

# Native workspace
build:
	cargo build --workspace

check:
	cargo check --workspace

test:
	cargo test --workspace

# WASM bridge (requires rustup + wasm32 target)
wasm:
	wasm-pack build crates/forge-wasm-bridge --target web --out-dir ../../apps/canvas-app/pkg

# Development servers
serve-canvas: wasm
	@echo "Canvas app running at http://localhost:8080"
	python3 -m http.server 8080 --directory apps/canvas-app

serve-timelapse:
	@echo "Timelapse verifier running at http://localhost:8081"
	python3 -m http.server 8081 --directory apps/timelapse-verifier

# Run the Anvil daemon
daemon:
	cargo run -p anvil-core

# CLI tools
keygen:
	cargo run -p forge-cli -- keygen

verify:
	@test -n "$(FILE)" || (echo "Usage: make verify FILE=path/to/manifest.json" && exit 1)
	cargo run -p forge-cli -- verify $(FILE)

# CI (mirrors GitHub Actions checks)
ci: check test wasm
	cargo fmt --all -- --check
	cargo clippy --workspace --all-targets -- -D warnings

# Assemble deployable site (mirrors deploy workflow)
site: wasm
	rm -rf _site
	mkdir -p _site/canvas _site/verify
	cp apps/landing/index.html _site/
	cp -r apps/canvas-app/index.html apps/canvas-app/app.js apps/canvas-app/style.css apps/canvas-app/src apps/canvas-app/pkg _site/canvas/
	cp apps/timelapse-verifier/index.html apps/timelapse-verifier/analyzer.js apps/timelapse-verifier/style.css _site/verify/

clean:
	cargo clean
	rm -rf apps/canvas-app/pkg _site
