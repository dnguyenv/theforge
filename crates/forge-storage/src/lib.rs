mod sqlite_store;

use thiserror::Error;

pub use sqlite_store::SqliteStore;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("database error: {0}")]
    Database(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("serialization error: {0}")]
    Serialization(String),
}

impl From<rusqlite::Error> for StorageError {
    fn from(e: rusqlite::Error) -> Self {
        StorageError::Database(e.to_string())
    }
}

pub trait EventStore: Send + Sync {
    fn append_event(&self, session_id: &str, sequence_id: u64, data: &[u8]) -> Result<(), StorageError>;
    fn get_events(&self, session_id: &str, from_seq: u64, limit: usize) -> Result<Vec<StoredEvent>, StorageError>;
    fn get_latest_sequence(&self, session_id: &str) -> Result<u64, StorageError>;
}

pub trait SyncQueue: Send + Sync {
    fn enqueue(&self, merkle_root: &[u8], session_id: &str) -> Result<(), StorageError>;
    fn dequeue_batch(&self, limit: usize) -> Result<Vec<SyncItem>, StorageError>;
    fn mark_synced(&self, id: u64) -> Result<(), StorageError>;
}

#[derive(Debug, Clone)]
pub struct StoredEvent {
    pub session_id: String,
    pub sequence_id: u64,
    pub data: Vec<u8>,
    pub created_at: u64,
}

#[derive(Debug, Clone)]
pub struct SyncItem {
    pub id: u64,
    pub session_id: String,
    pub merkle_root: Vec<u8>,
    pub created_at: u64,
}
