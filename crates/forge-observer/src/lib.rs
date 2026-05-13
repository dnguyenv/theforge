pub mod proto {
    pub mod common {
        tonic::include_proto!("theforge.common.v1");
    }
    pub mod observer {
        tonic::include_proto!("theforge.observer.v1");
    }
}

pub mod server;

pub use server::ObserverService;
