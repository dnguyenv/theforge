use tracing::info;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter("anvil_core=info")
        .init();

    info!("The Anvil is heating up...");
    info!("This is the way.");
}
