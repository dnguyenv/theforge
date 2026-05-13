use std::sync::Arc;
use std::time::Duration;

use forge_session::SessionManager;
use tracing::{debug, warn};

pub fn spawn_heartbeat(
    session_manager: Arc<SessionManager>,
    interval: Duration,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(interval);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            ticker.tick().await;
            debug!("heartbeat pulse");
            // The session manager tracks last_heartbeat on each strike.
            // Here we could flag sessions with gaps, but for now this
            // serves as the liveness signal the PRD requires.
            let _ = &session_manager;
        }
    })
}

pub fn spawn_sync_timer(
    store: Arc<forge_storage::SqliteStore>,
    interval: Duration,
) -> tokio::task::JoinHandle<()> {
    use forge_storage::SyncQueue;

    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(interval);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            ticker.tick().await;
            match store.dequeue_batch(50) {
                Ok(items) if items.is_empty() => {}
                Ok(items) => {
                    debug!(count = items.len(), "pending sync items");
                }
                Err(e) => {
                    warn!(error = %e, "sync queue check failed");
                }
            }
        }
    })
}
