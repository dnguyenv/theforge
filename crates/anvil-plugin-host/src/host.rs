use std::collections::HashMap;
use std::path::Path;

use wasmtime::Engine;
use tracing::{info, error};

use crate::{PluginError, PluginInstance};

pub struct PluginHost {
    engine: Engine,
    plugins: HashMap<String, PluginInstance>,
}

impl PluginHost {
    pub fn new() -> Result<Self, PluginError> {
        let engine = Engine::default();
        Ok(Self {
            engine,
            plugins: HashMap::new(),
        })
    }

    pub fn load_plugin(
        &mut self,
        name: &str,
        wasm_bytes: &[u8],
        session_id: &str,
    ) -> Result<(), PluginError> {
        let mut instance = PluginInstance::from_bytes(&self.engine, wasm_bytes, session_id)?;
        instance.call_init()?;
        self.plugins.insert(name.to_string(), instance);
        info!(plugin = name, "plugin loaded");
        Ok(())
    }

    pub fn load_plugin_from_file(
        &mut self,
        name: &str,
        path: &Path,
        session_id: &str,
    ) -> Result<(), PluginError> {
        let bytes = std::fs::read(path)
            .map_err(|e| PluginError::Compilation(format!("failed to read {}: {e}", path.display())))?;
        self.load_plugin(name, &bytes, session_id)
    }

    pub fn tick(&mut self, timestamp_ms: u64) {
        for (name, instance) in &mut self.plugins {
            if let Err(e) = instance.call_on_tick(timestamp_ms) {
                error!(plugin = %name, error = %e, "tick failed");
            }
        }
    }

    pub fn collect_output(&mut self, name: &str) -> Option<Vec<u8>> {
        self.plugins.get_mut(name).map(|p| p.take_output())
    }

    pub fn unload_plugin(&mut self, name: &str) -> Result<(), PluginError> {
        if let Some(mut instance) = self.plugins.remove(name) {
            instance.call_shutdown()?;
            info!(plugin = name, "plugin unloaded");
        }
        Ok(())
    }

    pub fn unload_all(&mut self) {
        let names: Vec<String> = self.plugins.keys().cloned().collect();
        for name in names {
            let _ = self.unload_plugin(&name);
        }
    }

    pub fn loaded_plugins(&self) -> Vec<&str> {
        self.plugins.keys().map(|s| s.as_str()).collect()
    }
}

impl Default for PluginHost {
    fn default() -> Self {
        Self::new().expect("failed to create wasmtime engine")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Minimal valid Wasm module (empty, no exports besides memory)
    fn minimal_wasm() -> Vec<u8> {
        wat::parse_str(
            r#"(module
                (memory (export "memory") 1)
            )"#,
        ).unwrap()
    }

    // Wasm module with forge_init that does nothing
    fn wasm_with_init() -> Vec<u8> {
        wat::parse_str(
            r#"(module
                (memory (export "memory") 1)
                (func (export "forge_init"))
                (func (export "forge_shutdown"))
                (func (export "forge_on_tick") (param i64))
            )"#,
        ).unwrap()
    }

    // Wasm module that calls emit_strike on tick
    fn wasm_emitter() -> Vec<u8> {
        wat::parse_str(
            r#"(module
                (import "forge" "emit_strike" (func $emit (param i32 i32) (result i32)))
                (memory (export "memory") 1)
                (data (i32.const 0) "hello forge")
                (func (export "forge_init"))
                (func (export "forge_shutdown"))
                (func (export "forge_on_tick") (param i64)
                    (drop (call $emit (i32.const 0) (i32.const 11)))
                )
            )"#,
        ).unwrap()
    }

    #[test]
    fn load_minimal_plugin() {
        let mut host = PluginHost::new().unwrap();
        host.load_plugin("minimal", &minimal_wasm(), "sess-1").unwrap();
        assert_eq!(host.loaded_plugins().len(), 1);
    }

    #[test]
    fn load_plugin_with_lifecycle() {
        let mut host = PluginHost::new().unwrap();
        host.load_plugin("lifecycle", &wasm_with_init(), "sess-2").unwrap();
        host.tick(1000);
        host.unload_plugin("lifecycle").unwrap();
        assert_eq!(host.loaded_plugins().len(), 0);
    }

    #[test]
    fn plugin_emits_data() {
        let mut host = PluginHost::new().unwrap();
        host.load_plugin("emitter", &wasm_emitter(), "sess-3").unwrap();
        host.tick(5000);

        let output = host.collect_output("emitter").unwrap();
        assert_eq!(output, b"hello forge");
    }

    #[test]
    fn unload_all_plugins() {
        let mut host = PluginHost::new().unwrap();
        host.load_plugin("a", &wasm_with_init(), "s").unwrap();
        host.load_plugin("b", &wasm_with_init(), "s").unwrap();
        host.unload_all();
        assert!(host.loaded_plugins().is_empty());
    }
}
