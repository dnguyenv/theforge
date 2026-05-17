use std::sync::Arc;

use anvil_event_bus::{EventBus, EventBusError, EventSubscriber, StrikeEvent};
use forge_storage::{EventStore, SqliteStore};
use tracing::{error, trace};

pub fn spawn_persistence_writer(
    store: Arc<SqliteStore>,
    bus: Arc<dyn EventBus>,
) -> tokio::task::JoinHandle<()> {
    let subscriber = bus.subscribe();

    tokio::task::spawn_blocking(move || {
        write_loop(store, subscriber);
    })
}

fn write_loop(store: Arc<SqliteStore>, subscriber: Box<dyn EventSubscriber>) {
    loop {
        match subscriber.recv() {
            Ok(event) => {
                let data = serialize_event(&event);
                if let Err(e) = store.append_event(&event.session_id, event.sequence_id, &data) {
                    error!(
                        session_id = %event.session_id,
                        seq = event.sequence_id,
                        error = %e,
                        "failed to persist event"
                    );
                } else {
                    trace!(
                        session_id = %event.session_id,
                        seq = event.sequence_id,
                        "event persisted"
                    );
                }
            }
            Err(EventBusError::Closed) => {
                break;
            }
            Err(e) => {
                error!(error = %e, "event bus recv error");
                break;
            }
        }
    }
}

fn serialize_event(event: &StrikeEvent) -> Vec<u8> {
    serde_json::to_vec(event).unwrap_or_default()
}
