use forge_merkle::Hash;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ExportError {
    #[error("signing failed: {0}")]
    Signing(String),
    #[error("manifest construction failed: {0}")]
    Manifest(String),
    #[error("file format not supported: {0}")]
    UnsupportedFormat(String),
}

pub struct BeskarManifest {
    pub merkle_root: Hash,
    pub leaf_count: usize,
    pub purity_grade: String,
    pub purity_score: f64,
    pub chain_code: String,
    pub session_id: String,
}

pub trait BeskarExporter: Send + Sync {
    fn export(&self, file_path: &str, manifest: &BeskarManifest) -> Result<(), ExportError>;
}
