use thiserror::Error;

#[derive(Debug, Error)]
pub enum SyncError {
    #[error("network error: {0}")]
    Network(String),
    #[error("ledger rejected transaction: {0}")]
    Rejected(String),
    #[error("storage error: {0}")]
    Storage(#[from] forge_storage::StorageError),
}

pub trait SyncEngine: Send + Sync {
    fn sync_pending(&self) -> impl std::future::Future<Output = Result<usize, SyncError>> + Send;
}
