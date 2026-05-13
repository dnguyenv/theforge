mod engine;

use thiserror::Error;

pub use engine::SyncEngine;

#[derive(Debug, Error)]
pub enum SyncError {
    #[error("network error: {0}")]
    Network(String),
    #[error("ledger rejected transaction: {0}")]
    Rejected(String),
    #[error("storage error: {0}")]
    Storage(#[from] forge_storage::StorageError),
    #[error("all retries exhausted")]
    RetriesExhausted,
}

pub trait LedgerBackend: Send + Sync {
    fn submit(
        &self,
        session_id: &str,
        merkle_root: &[u8],
    ) -> impl std::future::Future<Output = Result<String, SyncError>> + Send;
}
