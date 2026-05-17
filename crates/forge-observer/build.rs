fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::configure()
        .build_server(true)
        .build_client(true)
        .compile_protos(&["../../proto/common.proto"], &["../../proto"])?;

    tonic_build::configure()
        .build_server(true)
        .build_client(true)
        .extern_path(".theforge.common.v1", "crate::proto::common")
        .compile_protos(&["../../proto/forge_observer.proto"], &["../../proto"])?;

    Ok(())
}
