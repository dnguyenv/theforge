use std::path::Path;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection};

use crate::{EventStore, StorageError, StoredEvent, SyncItem, SyncQueue};

pub struct SqliteStore {
    conn: Mutex<Connection>,
}

impl SqliteStore {
    pub fn open(path: &Path) -> Result<Self, StorageError> {
        let conn = Connection::open(path)?;
        let store = Self {
            conn: Mutex::new(conn),
        };
        store.init_schema()?;
        Ok(store)
    }

    pub fn in_memory() -> Result<Self, StorageError> {
        let conn = Connection::open_in_memory()?;
        let store = Self {
            conn: Mutex::new(conn),
        };
        store.init_schema()?;
        Ok(store)
    }

    fn init_schema(&self) -> Result<(), StorageError> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;

             CREATE TABLE IF NOT EXISTS events (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 session_id TEXT NOT NULL,
                 sequence_id INTEGER NOT NULL,
                 data BLOB NOT NULL,
                 created_at INTEGER NOT NULL,
                 UNIQUE(session_id, sequence_id)
             );

             CREATE INDEX IF NOT EXISTS idx_events_session_seq
                 ON events(session_id, sequence_id);

             CREATE TABLE IF NOT EXISTS sync_queue (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 session_id TEXT NOT NULL,
                 merkle_root BLOB NOT NULL,
                 created_at INTEGER NOT NULL,
                 synced INTEGER NOT NULL DEFAULT 0
             );

             CREATE INDEX IF NOT EXISTS idx_sync_queue_pending
                 ON sync_queue(synced, created_at);",
        )?;
        Ok(())
    }
}

fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

impl EventStore for SqliteStore {
    fn append_event(&self, session_id: &str, sequence_id: u64, data: &[u8]) -> Result<(), StorageError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO events (session_id, sequence_id, data, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![session_id, sequence_id, data, now_epoch_ms()],
        )?;
        Ok(())
    }

    fn get_events(&self, session_id: &str, from_seq: u64, limit: usize) -> Result<Vec<StoredEvent>, StorageError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT session_id, sequence_id, data, created_at FROM events
             WHERE session_id = ?1 AND sequence_id >= ?2
             ORDER BY sequence_id ASC LIMIT ?3",
        )?;

        let rows = stmt.query_map(params![session_id, from_seq, limit], |row| {
            Ok(StoredEvent {
                session_id: row.get(0)?,
                sequence_id: row.get(1)?,
                data: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;

        let mut events = Vec::new();
        for row in rows {
            events.push(row.map_err(|e| StorageError::Database(e.to_string()))?);
        }
        Ok(events)
    }

    fn get_latest_sequence(&self, session_id: &str) -> Result<u64, StorageError> {
        let conn = self.conn.lock().unwrap();
        let result: Option<u64> = conn.query_row(
            "SELECT MAX(sequence_id) FROM events WHERE session_id = ?1",
            params![session_id],
            |row| row.get(0),
        )?;
        Ok(result.unwrap_or(0))
    }
}

impl SyncQueue for SqliteStore {
    fn enqueue(&self, merkle_root: &[u8], session_id: &str) -> Result<(), StorageError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO sync_queue (session_id, merkle_root, created_at) VALUES (?1, ?2, ?3)",
            params![session_id, merkle_root, now_epoch_ms()],
        )?;
        Ok(())
    }

    fn dequeue_batch(&self, limit: usize) -> Result<Vec<SyncItem>, StorageError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, session_id, merkle_root, created_at FROM sync_queue
             WHERE synced = 0 ORDER BY created_at ASC LIMIT ?1",
        )?;

        let rows = stmt.query_map(params![limit], |row| {
            Ok(SyncItem {
                id: row.get(0)?,
                session_id: row.get(1)?,
                merkle_root: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;

        let mut items = Vec::new();
        for row in rows {
            items.push(row.map_err(|e| StorageError::Database(e.to_string()))?);
        }
        Ok(items)
    }

    fn mark_synced(&self, id: u64) -> Result<(), StorageError> {
        let conn = self.conn.lock().unwrap();
        let changed = conn.execute(
            "UPDATE sync_queue SET synced = 1 WHERE id = ?1",
            params![id],
        )?;
        if changed == 0 {
            return Err(StorageError::NotFound(format!("sync item {id}")));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> SqliteStore {
        SqliteStore::in_memory().unwrap()
    }

    #[test]
    fn append_and_retrieve_events() {
        let s = store();
        s.append_event("sess-1", 1, b"event-one").unwrap();
        s.append_event("sess-1", 2, b"event-two").unwrap();
        s.append_event("sess-1", 3, b"event-three").unwrap();

        let events = s.get_events("sess-1", 1, 10).unwrap();
        assert_eq!(events.len(), 3);
        assert_eq!(events[0].data, b"event-one");
        assert_eq!(events[2].sequence_id, 3);
    }

    #[test]
    fn get_events_respects_from_seq() {
        let s = store();
        for i in 1..=5 {
            s.append_event("s", i, &[i as u8]).unwrap();
        }

        let events = s.get_events("s", 3, 10).unwrap();
        assert_eq!(events.len(), 3);
        assert_eq!(events[0].sequence_id, 3);
    }

    #[test]
    fn get_events_respects_limit() {
        let s = store();
        for i in 1..=10 {
            s.append_event("s", i, &[i as u8]).unwrap();
        }

        let events = s.get_events("s", 1, 3).unwrap();
        assert_eq!(events.len(), 3);
    }

    #[test]
    fn latest_sequence_empty() {
        let s = store();
        assert_eq!(s.get_latest_sequence("nonexistent").unwrap(), 0);
    }

    #[test]
    fn latest_sequence_tracks_max() {
        let s = store();
        s.append_event("sess", 5, b"a").unwrap();
        s.append_event("sess", 10, b"b").unwrap();
        s.append_event("sess", 7, b"c").unwrap();

        assert_eq!(s.get_latest_sequence("sess").unwrap(), 10);
    }

    #[test]
    fn sessions_are_isolated() {
        let s = store();
        s.append_event("a", 1, b"alpha").unwrap();
        s.append_event("b", 1, b"beta").unwrap();

        let events_a = s.get_events("a", 0, 10).unwrap();
        let events_b = s.get_events("b", 0, 10).unwrap();

        assert_eq!(events_a.len(), 1);
        assert_eq!(events_b.len(), 1);
        assert_eq!(events_a[0].data, b"alpha");
        assert_eq!(events_b[0].data, b"beta");
    }

    #[test]
    fn duplicate_sequence_rejected() {
        let s = store();
        s.append_event("s", 1, b"first").unwrap();
        let result = s.append_event("s", 1, b"duplicate");
        assert!(result.is_err());
    }

    #[test]
    fn sync_queue_enqueue_and_dequeue() {
        let s = store();
        s.enqueue(b"root-1", "sess-1").unwrap();
        s.enqueue(b"root-2", "sess-1").unwrap();

        let batch = s.dequeue_batch(10).unwrap();
        assert_eq!(batch.len(), 2);
        assert_eq!(batch[0].merkle_root, b"root-1");
        assert_eq!(batch[1].merkle_root, b"root-2");
    }

    #[test]
    fn mark_synced_removes_from_pending() {
        let s = store();
        s.enqueue(b"root-1", "s").unwrap();
        s.enqueue(b"root-2", "s").unwrap();

        let batch = s.dequeue_batch(10).unwrap();
        s.mark_synced(batch[0].id).unwrap();

        let remaining = s.dequeue_batch(10).unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].merkle_root, b"root-2");
    }

    #[test]
    fn mark_synced_nonexistent_errors() {
        let s = store();
        let result = s.mark_synced(999);
        assert!(result.is_err());
    }

    #[test]
    fn dequeue_respects_limit() {
        let s = store();
        for i in 0..10 {
            s.enqueue(&[i], "s").unwrap();
        }

        let batch = s.dequeue_batch(3).unwrap();
        assert_eq!(batch.len(), 3);
    }
}
