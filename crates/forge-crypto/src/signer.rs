use crate::CryptoError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum SignatureAlgorithm {
    Ed25519,
}

pub trait SigningProvider: Send + Sync {
    fn sign(&self, payload: &[u8]) -> Result<Vec<u8>, CryptoError>;
    fn public_key(&self) -> &[u8];
    fn algorithm(&self) -> SignatureAlgorithm;
    fn did(&self) -> &str;
    fn verify(&self, payload: &[u8], signature: &[u8]) -> Result<bool, CryptoError>;
}
