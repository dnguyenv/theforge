mod did;
mod error;
mod signer;
mod software_signer;

#[cfg(all(target_os = "macos", feature = "apple-enclave"))]
mod enclave_apple;

pub use did::generate_did;
pub use error::CryptoError;
pub use signer::{SignatureAlgorithm, SigningProvider};
pub use software_signer::SoftwareSigner;

#[cfg(all(target_os = "macos", feature = "apple-enclave"))]
pub use enclave_apple::EnclaveSignerApple;
