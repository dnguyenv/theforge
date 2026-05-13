mod manifest;

use thiserror::Error;

pub use manifest::{BeskarManifest, ForgeAssertion, ManifestBuilder};

#[derive(Debug, Error)]
pub enum ExportError {
    #[error("signing failed: {0}")]
    Signing(String),
    #[error("manifest construction failed: {0}")]
    Manifest(String),
    #[error("file format not supported: {0}")]
    UnsupportedFormat(String),
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}
