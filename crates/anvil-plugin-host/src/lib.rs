mod host;
mod runtime;

use thiserror::Error;

pub use host::PluginHost;
pub use runtime::PluginInstance;

#[derive(Debug, Error)]
pub enum PluginError {
    #[error("wasm compilation failed: {0}")]
    Compilation(String),
    #[error("wasm instantiation failed: {0}")]
    Instantiation(String),
    #[error("plugin function call failed: {0}")]
    Call(String),
    #[error("plugin returned error: {0}")]
    PluginReturn(String),
    #[error("memory access error: {0}")]
    Memory(String),
}
