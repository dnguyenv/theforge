use serde::{Deserialize, Serialize};
use thiserror::Error;

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

pub trait SessionManager: Send + Sync {
    fn start_session(&self, chain_code: &str) -> Result<String, SessionError>;
    fn pause_session(&self, session_id: &str) -> Result<(), SessionError>;
    fn resume_session(&self, session_id: &str) -> Result<(), SessionError>;
    fn close_session(&self, session_id: &str) -> Result<(), SessionError>;
    fn get_state(&self, session_id: &str) -> Result<SessionState, SessionError>;
}
