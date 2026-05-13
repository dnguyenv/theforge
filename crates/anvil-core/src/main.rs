use std::sync::Arc;

use tonic::transport::Server;
use tracing::info;

use anvil_event_bus::RingBus;
use forge_observer::proto::observer::forge_observer_server::ForgeObserverServer;
use forge_observer::ObserverService;
use forge_session::SessionManager;

const DEFAULT_PORT: u16 = 50051;
const EVENT_BUS_CAPACITY: usize = 16_384;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter("anvil_core=info,forge_observer=info")
        .init();

    let addr = format!("0.0.0.0:{DEFAULT_PORT}").parse()?;

    let session_manager = Arc::new(SessionManager::new());
    let event_bus: Arc<dyn anvil_event_bus::EventBus> =
        Arc::new(RingBus::new(EVENT_BUS_CAPACITY));

    let observer = ObserverService::new(session_manager, event_bus);
    let grpc_service = ForgeObserverServer::new(observer);

    info!("The Anvil listening on {addr}");
    info!("This is the way.");

    Server::builder()
        .add_service(grpc_service)
        .serve(addr)
        .await?;

    Ok(())
}
