use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use forge_merkle::{Hash, MerkleTree};
use uuid::Uuid;

use crate::{
    SessionError, SessionInfo, SessionState, SessionSummary, HEARTBEAT_TOLERANCE_MS,
};

pub struct SessionManager {
    sessions: Mutex<HashMap<String, Session>>,
}

struct Session {
    info: SessionInfo,
    merkle_tree: MerkleTree,
    heartbeat_gaps: u32,
    pause_count: u32,
    pause_total_ms: u64,
    pause_started_at: Option<u64>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub fn start_session(&self, chain_code: &str) -> Result<SessionInfo, SessionError> {
        let session_id = Uuid::new_v4().to_string();
        let now = now_ms();

        let info = SessionInfo {
            session_id: session_id.clone(),
            chain_code: chain_code.to_string(),
            state: SessionState::Active,
            strike_count: 0,
            started_at: now,
            last_heartbeat: now,
        };

        let session = Session {
            info: info.clone(),
            merkle_tree: MerkleTree::new(),
            heartbeat_gaps: 0,
            pause_count: 0,
            pause_total_ms: 0,
            pause_started_at: None,
        };

        self.sessions.lock().unwrap().insert(session_id, session);
        Ok(info)
    }

    pub fn record_strike(&self, session_id: &str, data: &[u8]) -> Result<Hash, SessionError> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.to_string()))?;

        if session.info.state != SessionState::Active {
            return Err(SessionError::InvalidTransition {
                from: session.info.state,
                to: SessionState::Active,
            });
        }

        let now = now_ms();
        check_heartbeat_gap(session, now);

        let hash = session.merkle_tree.append(data);
        session.info.strike_count += 1;
        session.info.last_heartbeat = now;
        Ok(hash)
    }

    /// Record a heartbeat pulse from the background timer.
    /// Call this every HEARTBEAT_INTERVAL_MS while the session is active.
    pub fn record_heartbeat(&self, session_id: &str) -> Result<(), SessionError> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.to_string()))?;

        if session.info.state != SessionState::Active {
            return Ok(()); // Ignore heartbeat for paused/closed sessions
        }

        let now = now_ms();
        check_heartbeat_gap(session, now);
        session.info.last_heartbeat = now;
        Ok(())
    }

    pub fn pause(&self, session_id: &str) -> Result<(), SessionError> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.to_string()))?;

        if session.info.state != SessionState::Active {
            return Err(SessionError::InvalidTransition {
                from: session.info.state,
                to: SessionState::Paused,
            });
        }

        session.info.state = SessionState::Paused;
        session.pause_count += 1;
        session.pause_started_at = Some(now_ms());
        Ok(())
    }

    pub fn resume(&self, session_id: &str) -> Result<(), SessionError> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.to_string()))?;

        if session.info.state != SessionState::Paused {
            return Err(SessionError::InvalidTransition {
                from: session.info.state,
                to: SessionState::Active,
            });
        }

        let now = now_ms();
        if let Some(started) = session.pause_started_at.take() {
            session.pause_total_ms += now.saturating_sub(started);
        }

        session.info.state = SessionState::Active;
        session.info.last_heartbeat = now;
        Ok(())
    }

    pub fn close(&self, session_id: &str) -> Result<Option<Hash>, SessionError> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.to_string()))?;

        if session.info.state == SessionState::Closed {
            return Err(SessionError::AlreadyClosed);
        }

        // If closed while paused, account for pause time
        if let Some(started) = session.pause_started_at.take() {
            session.pause_total_ms += now_ms().saturating_sub(started);
        }

        session.info.state = SessionState::Closed;
        let root = session.merkle_tree.root().ok();
        Ok(root)
    }

    /// Produce a summary of the session for purity scoring.
    pub fn summary(&self, session_id: &str) -> Result<SessionSummary, SessionError> {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.to_string()))?;

        let now = now_ms();
        let duration_ms = now.saturating_sub(session.info.started_at);

        Ok(SessionSummary {
            session_id: session.info.session_id.clone(),
            chain_code: session.info.chain_code.clone(),
            strike_count: session.info.strike_count,
            duration_ms,
            heartbeat_gaps: session.heartbeat_gaps,
            pause_count: session.pause_count,
            pause_total_ms: session.pause_total_ms,
        })
    }

    pub fn get_info(&self, session_id: &str) -> Result<SessionInfo, SessionError> {
        let sessions = self.sessions.lock().unwrap();
        sessions
            .get(session_id)
            .map(|s| s.info.clone())
            .ok_or_else(|| SessionError::NotFound(session_id.to_string()))
    }

    pub fn merkle_root(&self, session_id: &str) -> Result<Option<Hash>, SessionError> {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.to_string()))?;
        Ok(session.merkle_tree.root().ok())
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

fn check_heartbeat_gap(session: &mut Session, now: u64) {
    let elapsed = now.saturating_sub(session.info.last_heartbeat);
    if elapsed > HEARTBEAT_TOLERANCE_MS {
        session.heartbeat_gaps += 1;
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_and_get_session() {
        let mgr = SessionManager::new();
        let info = mgr.start_session("did:forge:abc123").unwrap();

        assert_eq!(info.state, SessionState::Active);
        assert_eq!(info.chain_code, "did:forge:abc123");
        assert_eq!(info.strike_count, 0);

        let fetched = mgr.get_info(&info.session_id).unwrap();
        assert_eq!(fetched.session_id, info.session_id);
    }

    #[test]
    fn record_strikes_increments_count() {
        let mgr = SessionManager::new();
        let info = mgr.start_session("did:forge:x").unwrap();

        mgr.record_strike(&info.session_id, b"stroke-1").unwrap();
        mgr.record_strike(&info.session_id, b"stroke-2").unwrap();

        let updated = mgr.get_info(&info.session_id).unwrap();
        assert_eq!(updated.strike_count, 2);
    }

    #[test]
    fn record_strike_builds_merkle_tree() {
        let mgr = SessionManager::new();
        let info = mgr.start_session("did:forge:x").unwrap();

        mgr.record_strike(&info.session_id, b"a").unwrap();
        let root1 = mgr.merkle_root(&info.session_id).unwrap().unwrap();

        mgr.record_strike(&info.session_id, b"b").unwrap();
        let root2 = mgr.merkle_root(&info.session_id).unwrap().unwrap();

        assert_ne!(root1, root2);
    }

    #[test]
    fn pause_and_resume() {
        let mgr = SessionManager::new();
        let info = mgr.start_session("did:forge:x").unwrap();

        mgr.pause(&info.session_id).unwrap();
        assert_eq!(
            mgr.get_info(&info.session_id).unwrap().state,
            SessionState::Paused
        );

        mgr.resume(&info.session_id).unwrap();
        assert_eq!(
            mgr.get_info(&info.session_id).unwrap().state,
            SessionState::Active
        );
    }

    #[test]
    fn cannot_record_while_paused() {
        let mgr = SessionManager::new();
        let info = mgr.start_session("did:forge:x").unwrap();
        mgr.pause(&info.session_id).unwrap();

        let result = mgr.record_strike(&info.session_id, b"nope");
        assert!(result.is_err());
    }

    #[test]
    fn close_returns_merkle_root() {
        let mgr = SessionManager::new();
        let info = mgr.start_session("did:forge:x").unwrap();
        mgr.record_strike(&info.session_id, b"data").unwrap();

        let root = mgr.close(&info.session_id).unwrap();
        assert!(root.is_some());

        let state = mgr.get_info(&info.session_id).unwrap().state;
        assert_eq!(state, SessionState::Closed);
    }

    #[test]
    fn close_empty_session_returns_none() {
        let mgr = SessionManager::new();
        let info = mgr.start_session("did:forge:x").unwrap();

        let root = mgr.close(&info.session_id).unwrap();
        assert!(root.is_none());
    }

    #[test]
    fn double_close_errors() {
        let mgr = SessionManager::new();
        let info = mgr.start_session("did:forge:x").unwrap();
        mgr.close(&info.session_id).unwrap();

        let result = mgr.close(&info.session_id);
        assert!(matches!(result, Err(SessionError::AlreadyClosed)));
    }

    #[test]
    fn not_found_errors() {
        let mgr = SessionManager::new();
        assert!(matches!(
            mgr.get_info("bogus"),
            Err(SessionError::NotFound(_))
        ));
    }

    #[test]
    fn summary_tracks_pause_count() {
        let mgr = SessionManager::new();
        let info = mgr.start_session("did:forge:x").unwrap();

        mgr.pause(&info.session_id).unwrap();
        mgr.resume(&info.session_id).unwrap();
        mgr.pause(&info.session_id).unwrap();
        mgr.resume(&info.session_id).unwrap();

        let summary = mgr.summary(&info.session_id).unwrap();
        assert_eq!(summary.pause_count, 2);
    }

    #[test]
    fn summary_zero_gaps_for_fresh_session() {
        let mgr = SessionManager::new();
        let info = mgr.start_session("did:forge:x").unwrap();
        mgr.record_strike(&info.session_id, b"a").unwrap();

        let summary = mgr.summary(&info.session_id).unwrap();
        assert_eq!(summary.heartbeat_gaps, 0);
        assert_eq!(summary.strike_count, 1);
    }

    #[test]
    fn heartbeat_recorded() {
        let mgr = SessionManager::new();
        let info = mgr.start_session("did:forge:x").unwrap();
        mgr.record_heartbeat(&info.session_id).unwrap();

        let summary = mgr.summary(&info.session_id).unwrap();
        assert_eq!(summary.heartbeat_gaps, 0);
    }
}
