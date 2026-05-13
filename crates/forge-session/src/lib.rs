mod manager;

use serde::{Deserialize, Serialize};
use thiserror::Error;

pub use manager::{SessionManager, StrikeReceipt};

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

/// Summary produced when a session closes; feeds into purity scoring.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub session_id: String,
    pub chain_code: String,
    pub strike_count: u64,
    pub duration_ms: u64,
    pub heartbeat_gaps: u32,
    pub pause_count: u32,
    pub pause_total_ms: u64,
}

/// How much a heartbeat gap should penalize purity (0.0 to 1.0 per gap).
pub const HEARTBEAT_GAP_PENALTY: f64 = 0.02;
/// Interval in milliseconds between expected heartbeats.
pub const HEARTBEAT_INTERVAL_MS: u64 = 300_000; // 5 minutes
/// Tolerance before declaring a gap (allow 10% slack).
pub const HEARTBEAT_TOLERANCE_MS: u64 = 330_000;
