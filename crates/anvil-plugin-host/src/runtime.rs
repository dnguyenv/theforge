use wasmtime::{Engine, Linker, Module, Store};
use tracing::info;

use crate::PluginError;

pub struct PluginInstance {
    store: Store<PluginState>,
    instance: wasmtime::Instance,
}

pub struct PluginState {
    pub session_id: String,
    pub output_buffer: Vec<u8>,
}

impl PluginInstance {
    pub fn from_bytes(
        engine: &Engine,
        wasm_bytes: &[u8],
        session_id: &str,
    ) -> Result<Self, PluginError> {
        let module = Module::new(engine, wasm_bytes)
            .map_err(|e| PluginError::Compilation(e.to_string()))?;

        let mut linker = Linker::new(engine);
        register_host_functions(&mut linker)?;

        let state = PluginState {
            session_id: session_id.to_string(),
            output_buffer: Vec::new(),
        };

        let mut store = Store::new(engine, state);
        let instance = linker
            .instantiate(&mut store, &module)
            .map_err(|e| PluginError::Instantiation(e.to_string()))?;

        info!(session_id, "plugin instance created");

        Ok(Self { store, instance })
    }

    pub fn call_init(&mut self) -> Result<(), PluginError> {
        let func = self.instance.get_typed_func::<(), ()>(&mut self.store, "forge_init");
        match func {
            Ok(f) => f.call(&mut self.store, ())
                .map_err(|e| PluginError::Call(e.to_string())),
            Err(_) => Ok(()), // init is optional
        }
    }

    pub fn call_on_tick(&mut self, timestamp_ms: u64) -> Result<(), PluginError> {
        let func = self.instance.get_typed_func::<u64, ()>(&mut self.store, "forge_on_tick");
        match func {
            Ok(f) => f.call(&mut self.store, timestamp_ms)
                .map_err(|e| PluginError::Call(e.to_string())),
            Err(_) => Ok(()), // on_tick is optional
        }
    }

    pub fn call_shutdown(&mut self) -> Result<(), PluginError> {
        let func = self.instance.get_typed_func::<(), ()>(&mut self.store, "forge_shutdown");
        match func {
            Ok(f) => f.call(&mut self.store, ())
                .map_err(|e| PluginError::Call(e.to_string())),
            Err(_) => Ok(()),
        }
    }

    pub fn take_output(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.store.data_mut().output_buffer)
    }
}

fn register_host_functions(linker: &mut Linker<PluginState>) -> Result<(), PluginError> {
    linker
        .func_wrap("forge", "log", |_caller: wasmtime::Caller<'_, PluginState>, _level: i32, _ptr: i32, _len: i32| {
            // In a full implementation, this would read the string from wasm memory
            // and forward to tracing. Stubbed for now.
        })
        .map_err(|e| PluginError::Instantiation(e.to_string()))?;

    linker
        .func_wrap("forge", "emit_strike", |mut caller: wasmtime::Caller<'_, PluginState>, ptr: i32, len: i32| -> i32 {
            let memory = match caller.get_export("memory") {
                Some(wasmtime::Extern::Memory(m)) => m,
                _ => return -1,
            };

            let data = memory.data(&caller);
            let start = ptr as usize;
            let end = start + len as usize;

            if end > data.len() {
                return -1;
            }

            let event_bytes = data[start..end].to_vec();
            caller.data_mut().output_buffer.extend_from_slice(&event_bytes);
            0 // success
        })
        .map_err(|e| PluginError::Instantiation(e.to_string()))?;

    linker
        .func_wrap("forge", "get_session_id", |mut caller: wasmtime::Caller<'_, PluginState>, out_ptr: i32, out_cap: i32| -> i32 {
            let session_id = caller.data().session_id.clone();
            let bytes = session_id.as_bytes();
            let len = bytes.len().min(out_cap as usize);

            let memory = match caller.get_export("memory") {
                Some(wasmtime::Extern::Memory(m)) => m,
                _ => return -1,
            };

            let dest = out_ptr as usize;
            if dest + len > memory.data_size(&caller) {
                return -1;
            }

            memory.data_mut(&mut caller)[dest..dest + len].copy_from_slice(&bytes[..len]);
            len as i32
        })
        .map_err(|e| PluginError::Instantiation(e.to_string()))?;

    Ok(())
}
