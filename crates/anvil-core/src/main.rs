mod config;
mod heartbeat;
mod persistence;

use std::sync::Arc;
use std::time::Duration;

use tokio::signal;
use tonic::transport::Server;
use tracing::info;

use anvil_event_bus::RingBus;
use forge_observer::proto::observer::forge_observer_server::ForgeObserverServer;
use forge_observer::ObserverService;
use forge_session::SessionManager;
use forge_storage::SqliteStore;

use config::AnvilConfig;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG")
                .unwrap_or_else(|_| "anvil_core=info,forge_observer=info".into()),
        )
        .init();

    let config = load_config();

    std::fs::create_dir_all(&config.data_dir)?;
    let store = Arc::new(SqliteStore::open(&config.db_path())?);

    let session_manager = Arc::new(SessionManager::new());
    let event_bus: Arc<dyn anvil_event_bus::EventBus> =
        Arc::new(RingBus::new(config.event_bus_capacity));

    // Spawn background workers
    let _writer = persistence::spawn_persistence_writer(store.clone(), event_bus.clone());
    let _heartbeat = heartbeat::spawn_heartbeat(
        session_manager.clone(),
        Duration::from_secs(config.heartbeat_interval_secs),
    );
    let _sync_timer = heartbeat::spawn_sync_timer(
        store.clone(),
        Duration::from_secs(config.sync_interval_secs),
    );

    // gRPC server
    let addr = format!("0.0.0.0:{}", config.grpc_port).parse()?;
    let observer = ObserverService::new(session_manager, event_bus.clone());
    let grpc_service = ForgeObserverServer::new(observer);

    info!(port = config.grpc_port, data_dir = %config.data_dir.display(), "The Anvil is ready");
    info!("This is the way.");

    Server::builder()
        .add_service(grpc_service)
        .serve_with_shutdown(addr, shutdown_signal())
        .await?;

    info!("The Anvil is cooling down...");
    event_bus.close();

    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = signal::ctrl_c();
    #[cfg(unix)]
    let mut sigterm = signal::unix::signal(signal::unix::SignalKind::terminate()).unwrap();

    #[cfg(unix)]
    tokio::select! {
        _ = ctrl_c => info!("received SIGINT"),
        _ = sigterm.recv() => info!("received SIGTERM"),
    }

    #[cfg(not(unix))]
    ctrl_c.await.ok();
}

fn load_config() -> AnvilConfig {
    let config_path = std::env::var("ANVIL_CONFIG")
        .map(std::path::PathBuf::from)
        .ok();

    match config_path {
        Some(path) if path.exists() => {
            info!(path = %path.display(), "loading config");
            AnvilConfig::load(&path).unwrap_or_else(|e| {
                eprintln!("Warning: failed to load config: {e}, using defaults");
                AnvilConfig::default()
            })
        }
        _ => AnvilConfig::default(),
    }
}
