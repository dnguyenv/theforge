use std::sync::Arc;
use std::time::Duration;

use tokio::net::TcpListener;
use tonic::transport::Server;

use anvil_event_bus::{EventBus, RingBus};
use armorer_core::{PurityAnalyzer, PurityGrade, RuleBasedAnalyzer};
use beskar_export::ManifestBuilder;
use forge_crypto::{SigningProvider, SoftwareSigner};
use forge_observer::proto::common::{self, ActionType, Coordinates, Telemetry};
use forge_observer::proto::observer::forge_observer_client::ForgeObserverClient;
use forge_observer::proto::observer::forge_observer_server::ForgeObserverServer;
use forge_observer::proto::observer::{EndSessionRequest, StartSessionRequest};
use forge_observer::ObserverService;
use forge_session::SessionManager;
use forge_storage::{SqliteStore, SyncQueue};

async fn start_server() -> String {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let url = format!("http://{addr}");

    let session_manager = Arc::new(SessionManager::new());
    let event_bus: Arc<dyn EventBus> = Arc::new(RingBus::new(4096));
    let observer = ObserverService::new(session_manager, event_bus);

    tokio::spawn(async move {
        Server::builder()
            .add_service(ForgeObserverServer::new(observer))
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });

    tokio::time::sleep(Duration::from_millis(50)).await;
    url
}

fn make_strike(session_id: &str, seq: u64) -> common::StrikeEvent {
    common::StrikeEvent {
        session_id: session_id.to_string(),
        sequence_id: seq,
        action: ActionType::BrushStroke as i32,
        telemetry: Some(Telemetry {
            pressure: Some(0.3 + ((seq % 7) as f32) * 0.08),
            velocity: Some(50.0 + ((seq % 13) as f32) * 15.0),
            duration_ms: 10 + (seq % 40) as u32,
            tool_id: "brush-round".to_string(),
            coordinates: Some(Coordinates {
                x: seq as f64 * 2.5,
                y: (seq as f64 * 1.3).sin() * 100.0,
                z: None,
            }),
            input_entropy: 0.7 + (seq % 3) as f32 * 0.1,
        }),
        timestamp_ms: 1_000_000 + seq * 100, // strictly increasing: 100ms intervals
        metadata: Default::default(),
    }
}

#[tokio::test]
async fn full_pipeline_session_lifecycle() {
    let url = start_server().await;
    let mut client = ForgeObserverClient::connect(url).await.unwrap();

    // Start session
    let resp = client
        .start_session(StartSessionRequest {
            chain_code: "did:forge:test123".into(),
            signature: vec![],
            metadata: Default::default(),
        })
        .await
        .unwrap()
        .into_inner();

    let session_id = resp.session_id;
    assert!(!session_id.is_empty());
    assert!(resp.started_at > 0);

    // Record strikes
    for seq in 1..=50 {
        let ack = client
            .record_strike(make_strike(&session_id, seq))
            .await
            .unwrap()
            .into_inner();

        assert!(ack.accepted);
        assert_eq!(ack.sequence_id, seq);
        assert!(!ack.delta_hash.is_empty());
    }

    // End session and get merkle root
    let end_resp = client
        .end_session(EndSessionRequest {
            session_id: session_id.clone(),
        })
        .await
        .unwrap()
        .into_inner();

    assert_eq!(end_resp.session_id, session_id);
    assert_eq!(end_resp.strike_count, 50);
    assert_eq!(end_resp.merkle_root.len(), 32);
}

#[tokio::test]
async fn full_pipeline_purity_analysis() {
    let url = start_server().await;
    let mut client = ForgeObserverClient::connect(url).await.unwrap();

    let resp = client
        .start_session(StartSessionRequest {
            chain_code: "did:forge:artist1".into(),
            signature: vec![],
            metadata: Default::default(),
        })
        .await
        .unwrap()
        .into_inner();

    let session_id = resp.session_id;

    // Generate enough events for purity analysis (human-like pattern)
    let mut bus_events = Vec::new();
    let actions = [
        ActionType::BrushStroke,
        ActionType::BrushStroke,
        ActionType::ToolChange,
        ActionType::BrushStroke,
        ActionType::UndoRedo,
        ActionType::Selection,
    ];

    let mut ts = 500_000u64;
    for seq in 1..=100u64 {
        ts += 30 + (seq * 7) % 300; // strictly increasing
        let action = actions[(seq as usize) % actions.len()];
        let strike = common::StrikeEvent {
            session_id: session_id.clone(),
            sequence_id: seq,
            action: action as i32,
            telemetry: Some(Telemetry {
                pressure: Some(0.2 + ((seq % 11) as f32) * 0.06),
                velocity: Some(30.0 + ((seq % 17) as f32) * 12.0),
                duration_ms: 8 + (seq % 50) as u32,
                tool_id: "brush".into(),
                coordinates: Some(Coordinates {
                    x: seq as f64 * 1.8,
                    y: (seq as f64 * 0.7).cos() * 80.0,
                    z: None,
                }),
                input_entropy: 0.6 + (seq % 5) as f32 * 0.08,
            }),
            timestamp_ms: ts,
            metadata: Default::default(),
        };

        client.record_strike(strike).await.unwrap();

        // Build equivalent StrikeEvent for armorer
        bus_events.push(anvil_event_bus::StrikeEvent {
            session_id: session_id.clone(),
            sequence_id: seq,
            action: match action {
                ActionType::BrushStroke => anvil_event_bus::ActionType::BrushStroke,
                ActionType::ToolChange => anvil_event_bus::ActionType::ToolChange,
                ActionType::UndoRedo => anvil_event_bus::ActionType::UndoRedo,
                ActionType::Selection => anvil_event_bus::ActionType::Selection,
                _ => anvil_event_bus::ActionType::BrushStroke,
            },
            telemetry: anvil_event_bus::Telemetry {
                pressure: Some(0.2 + ((seq % 11) as f32) * 0.06),
                velocity: Some(30.0 + ((seq % 17) as f32) * 12.0),
                duration_ms: 8 + (seq % 50) as u32,
                tool_id: "brush".into(),
                coordinates: Some((seq as f64 * 1.8, (seq as f64 * 0.7).cos() * 80.0)),
                input_entropy: 0.6 + (seq % 5) as f32 * 0.08,
            },
            timestamp_ms: ts,
        });
    }

    // End session
    let end_resp = client
        .end_session(EndSessionRequest {
            session_id: session_id.clone(),
        })
        .await
        .unwrap()
        .into_inner();

    assert_eq!(end_resp.merkle_root.len(), 32);

    // Run purity analysis on collected events
    let analyzer = RuleBasedAnalyzer::new();
    let report = analyzer.analyze(&bus_events).unwrap();

    assert!(report.score > 0.5);
    assert!(!matches!(report.grade, PurityGrade::Synthetic));

    // Build Beskar manifest
    let signer = SoftwareSigner::generate().unwrap();
    let mut merkle_root = [0u8; 32];
    merkle_root.copy_from_slice(&end_resp.merkle_root);

    let manifest = ManifestBuilder::new(&session_id)
        .purity(report.grade, report.score, report.confidence)
        .merkle(merkle_root, 100, None)
        .chain_code(signer.did(), 30_000, 100)
        .build(&signer)
        .unwrap();

    assert_eq!(manifest.assertions.len(), 3);

    // Verify manifest signature
    let payload = serde_json::to_vec(&manifest.assertions).unwrap();
    assert!(signer.verify(&payload, &manifest.signature).unwrap());
}

#[tokio::test]
async fn full_pipeline_storage_and_sync() {
    let store = Arc::new(SqliteStore::in_memory().unwrap());

    // Simulate storing events and queuing merkle roots
    for seq in 1..=20u64 {
        store
            .append_event("sess-integration", seq, &[seq as u8; 32])
            .unwrap();
    }

    // Queue a merkle root for sync
    let merkle_root = [0xAB; 32];
    store.enqueue(&merkle_root, "sess-integration").unwrap();

    let pending = store.dequeue_batch(10).unwrap();
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].merkle_root, merkle_root);
    assert_eq!(pending[0].session_id, "sess-integration");

    store.mark_synced(pending[0].id).unwrap();
    assert_eq!(store.dequeue_batch(10).unwrap().len(), 0);
}

use forge_storage::EventStore;
