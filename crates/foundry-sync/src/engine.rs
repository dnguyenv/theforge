use std::sync::Arc;
use std::time::Duration;

use tokio::time::sleep;
use tracing::{info, warn};

use forge_storage::{SqliteStore, SyncQueue};

use crate::{LedgerBackend, SyncError};

const MAX_RETRIES: u32 = 5;
const BASE_DELAY_MS: u64 = 1000;
const MAX_DELAY_MS: u64 = 300_000; // 5 minutes

pub struct SyncEngine<B: LedgerBackend> {
    store: Arc<SqliteStore>,
    backend: B,
    batch_size: usize,
}

impl<B: LedgerBackend> SyncEngine<B> {
    pub fn new(store: Arc<SqliteStore>, backend: B) -> Self {
        Self {
            store,
            backend,
            batch_size: 50,
        }
    }

    pub fn with_batch_size(mut self, size: usize) -> Self {
        self.batch_size = size;
        self
    }

    pub async fn sync_pending(&self) -> Result<usize, SyncError> {
        let items = self.store.dequeue_batch(self.batch_size)?;
        if items.is_empty() {
            return Ok(0);
        }

        let mut synced = 0;
        for item in &items {
            match self
                .submit_with_retry(&item.session_id, &item.merkle_root)
                .await
            {
                Ok(tx_id) => {
                    self.store.mark_synced(item.id)?;
                    info!(session_id = %item.session_id, tx_id = %tx_id, "synced to ledger");
                    synced += 1;
                }
                Err(e) => {
                    warn!(session_id = %item.session_id, error = %e, "sync failed, will retry later");
                    break;
                }
            }
        }

        Ok(synced)
    }

    pub async fn run_loop(&self, interval: Duration) {
        loop {
            match self.sync_pending().await {
                Ok(0) => {}
                Ok(n) => info!(count = n, "batch synced"),
                Err(e) => warn!(error = %e, "sync cycle failed"),
            }
            sleep(interval).await;
        }
    }

    async fn submit_with_retry(
        &self,
        session_id: &str,
        merkle_root: &[u8],
    ) -> Result<String, SyncError> {
        let mut delay = BASE_DELAY_MS;

        for attempt in 0..MAX_RETRIES {
            match self.backend.submit(session_id, merkle_root).await {
                Ok(tx_id) => return Ok(tx_id),
                Err(SyncError::Rejected(reason)) => return Err(SyncError::Rejected(reason)),
                Err(_) if attempt < MAX_RETRIES - 1 => {
                    sleep(Duration::from_millis(delay)).await;
                    delay = (delay * 2).min(MAX_DELAY_MS);
                }
                Err(e) => return Err(e),
            }
        }

        Err(SyncError::RetriesExhausted)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct MockBackend {
        call_count: AtomicUsize,
        fail_first_n: usize,
    }

    impl MockBackend {
        fn always_succeeds() -> Self {
            Self {
                call_count: AtomicUsize::new(0),
                fail_first_n: 0,
            }
        }

        fn fail_first(n: usize) -> Self {
            Self {
                call_count: AtomicUsize::new(0),
                fail_first_n: n,
            }
        }
    }

    impl LedgerBackend for MockBackend {
        async fn submit(
            &self,
            _session_id: &str,
            _merkle_root: &[u8],
        ) -> Result<String, SyncError> {
            let call = self.call_count.fetch_add(1, Ordering::SeqCst);
            if call < self.fail_first_n {
                Err(SyncError::Network("timeout".into()))
            } else {
                Ok(format!("tx_{call}"))
            }
        }
    }

    fn test_store() -> Arc<SqliteStore> {
        Arc::new(SqliteStore::in_memory().unwrap())
    }

    #[tokio::test]
    async fn sync_empty_queue() {
        let store = test_store();
        let engine = SyncEngine::new(store, MockBackend::always_succeeds());
        let synced = engine.sync_pending().await.unwrap();
        assert_eq!(synced, 0);
    }

    #[tokio::test]
    async fn sync_pending_items() {
        let store = test_store();
        store.enqueue(b"root-1", "sess-1").unwrap();
        store.enqueue(b"root-2", "sess-2").unwrap();

        let engine = SyncEngine::new(store.clone(), MockBackend::always_succeeds());
        let synced = engine.sync_pending().await.unwrap();

        assert_eq!(synced, 2);
        assert_eq!(store.dequeue_batch(10).unwrap().len(), 0);
    }

    #[tokio::test]
    async fn retry_on_transient_failure() {
        let store = test_store();
        store.enqueue(b"root-1", "sess-1").unwrap();

        let backend = MockBackend::fail_first(2);
        let engine = SyncEngine::new(store.clone(), backend);
        let synced = engine.sync_pending().await.unwrap();

        assert_eq!(synced, 1);
    }

    #[tokio::test]
    async fn respects_batch_size() {
        let store = test_store();
        for i in 0..10 {
            store.enqueue(&[i], &format!("sess-{i}")).unwrap();
        }

        let engine =
            SyncEngine::new(store.clone(), MockBackend::always_succeeds()).with_batch_size(3);
        let synced = engine.sync_pending().await.unwrap();

        assert_eq!(synced, 3);
        assert_eq!(store.dequeue_batch(100).unwrap().len(), 7);
    }
}
