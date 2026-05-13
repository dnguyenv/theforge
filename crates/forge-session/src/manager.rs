use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use forge_merkle::{Hash, MerkleTree};
use uuid::Uuid;

use crate::{SessionError, SessionInfo, SessionState};

pub struct SessionManager {
    sessions: Mutex<HashMap<String, Session>>,
}

struct Session {
    info: SessionInfo,
    merkle_tree: MerkleTree,
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

        let hash = session.merkle_tree.append(data);
        session.info.strike_count += 1;
        session.info.last_heartbeat = now_ms();
        Ok(hash)
    }

    pub fn pause(&self, session_id: &str) -> Result<(), SessionError> {
        self.transition(session_id, SessionState::Paused)
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

        session.info.state = SessionState::Active;
        session.info.last_heartbeat = now_ms();
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

        session.info.state = SessionState::Closed;
        let root = session.merkle_tree.root().ok();
        Ok(root)
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

    fn transition(&self, session_id: &str, target: SessionState) -> Result<(), SessionError> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.to_string()))?;

        let valid = matches!(
            (session.info.state, target),
            (SessionState::Active, SessionState::Paused)
                | (SessionState::Paused, SessionState::Active)
                | (SessionState::Active, SessionState::Closing)
                | (SessionState::Closing, SessionState::Closed)
        );

        if !valid {
            return Err(SessionError::InvalidTransition {
                from: session.info.state,
                to: target,
            });
        }

        session.info.state = target;
        Ok(())
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
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
}
