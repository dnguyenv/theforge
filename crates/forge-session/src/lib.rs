mod manager;

use serde::{Deserialize, Serialize};
use thiserror::Error;

pub use manager::SessionManager;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SessionState {
    Active,
    Paused,
    Closing,
    Closed,
}

#[derive(Debug, Error)]
pub enum SessionError {
    #[error("invalid state transition from {from:?} to {to:?}")]
    InvalidTransition { from: SessionState, to: SessionState },
    #[error("session not found: {0}")]
    NotFound(String),
    #[error("session already closed")]
    AlreadyClosed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub session_id: String,
    pub chain_code: String,
    pub state: SessionState,
    pub strike_count: u64,
    pub started_at: u64,
    pub last_heartbeat: u64,
}
