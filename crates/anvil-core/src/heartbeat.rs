use std::sync::Arc;
use std::time::Duration;

use forge_session::SessionManager;
use forge_storage::{SqliteStore, SyncQueue};
use tracing::{debug, info, warn};

pub fn spawn_heartbeat(
    session_manager: Arc<SessionManager>,
    store: Arc<SqliteStore>,
    interval: Duration,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(interval);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            ticker.tick().await;
            debug!("heartbeat pulse");

            let sessions = session_manager.active_session_ids();
            for session_id in &sessions {
                let _ = session_manager.record_heartbeat(session_id);

                if let Ok(Some(root)) = session_manager.merkle_root(session_id) {
                    if let Err(e) = store.enqueue(&root, session_id) {
                        warn!(session_id, error = %e, "failed to enqueue merkle checkpoint");
                    } else {
                        debug!(session_id, "merkle root checkpoint enqueued");
                    }
                }
            }
        }
    })
}

pub fn spawn_sync_timer(
    store: Arc<SqliteStore>,
    interval: Duration,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(interval);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            ticker.tick().await;
            match store.dequeue_batch(50) {
                Ok(items) if items.is_empty() => {}
                Ok(items) => {
                    info!(count = items.len(), "pending sync items awaiting ledger upload");
                }
                Err(e) => {
                    warn!(error = %e, "sync queue check failed");
                }
            }
        }
    })
}
