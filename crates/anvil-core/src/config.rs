use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnvilConfig {
    pub grpc_port: u16,
    pub event_bus_capacity: usize,
    pub data_dir: PathBuf,
    pub heartbeat_interval_secs: u64,
    pub sync_interval_secs: u64,
    pub sync_batch_size: usize,
}

impl Default for AnvilConfig {
    fn default() -> Self {
        Self {
            grpc_port: 50051,
            event_bus_capacity: 16_384,
            data_dir: default_data_dir(),
            heartbeat_interval_secs: 300,
            sync_interval_secs: 60,
            sync_batch_size: 50,
        }
    }
}

impl AnvilConfig {
    pub fn load(path: &Path) -> Result<Self, ConfigError> {
        let contents = std::fs::read_to_string(path).map_err(|e| ConfigError::Io(e.to_string()))?;
        let config: Self =
            serde_json::from_str(&contents).map_err(|e| ConfigError::Parse(e.to_string()))?;
        Ok(config)
    }

    pub fn db_path(&self) -> PathBuf {
        self.data_dir.join("anvil.db")
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("io error: {0}")]
    Io(String),
    #[error("parse error: {0}")]
    Parse(String),
}

fn default_data_dir() -> PathBuf {
    dirs_fallback().join("theforge")
}

fn dirs_fallback() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(".local")
        .join("share")
}
