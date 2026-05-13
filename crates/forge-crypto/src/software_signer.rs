use ring::rand::SystemRandom;
use ring::signature::{Ed25519KeyPair, KeyPair, UnparsedPublicKey, ED25519};

use crate::did::generate_did;
use crate::error::CryptoError;
use crate::signer::{SignatureAlgorithm, SigningProvider};

pub struct SoftwareSigner {
    key_pair: Ed25519KeyPair,
    did: String,
}

impl SoftwareSigner {
    pub fn generate() -> Result<Self, CryptoError> {
        let rng = SystemRandom::new();
        let pkcs8_bytes = Ed25519KeyPair::generate_pkcs8(&rng)
            .map_err(|e| CryptoError::KeyGeneration(e.to_string()))?;

        let key_pair = Ed25519KeyPair::from_pkcs8(pkcs8_bytes.as_ref())
            .map_err(|e| CryptoError::InvalidKey(e.to_string()))?;

        let did = generate_did(key_pair.public_key().as_ref());

        Ok(Self { key_pair, did })
    }

    pub fn from_pkcs8(pkcs8_bytes: &[u8]) -> Result<Self, CryptoError> {
        let key_pair = Ed25519KeyPair::from_pkcs8(pkcs8_bytes)
            .map_err(|e| CryptoError::InvalidKey(e.to_string()))?;

        let did = generate_did(key_pair.public_key().as_ref());

        Ok(Self { key_pair, did })
    }
}

impl SigningProvider for SoftwareSigner {
    fn sign(&self, payload: &[u8]) -> Result<Vec<u8>, CryptoError> {
        Ok(self.key_pair.sign(payload).as_ref().to_vec())
    }

    fn public_key(&self) -> &[u8] {
        self.key_pair.public_key().as_ref()
    }

    fn algorithm(&self) -> SignatureAlgorithm {
        SignatureAlgorithm::Ed25519
    }

    fn did(&self) -> &str {
        &self.did
    }

    fn verify(&self, payload: &[u8], signature: &[u8]) -> Result<bool, CryptoError> {
        let public_key = UnparsedPublicKey::new(&ED25519, self.key_pair.public_key().as_ref());
        match public_key.verify(payload, signature) {
            Ok(()) => Ok(true),
            Err(_) => Ok(false),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_produces_valid_keypair() {
        let signer = SoftwareSigner::generate().unwrap();
        assert_eq!(signer.public_key().len(), 32);
        assert_eq!(signer.algorithm(), SignatureAlgorithm::Ed25519);
    }

    #[test]
    fn sign_and_verify_roundtrip() {
        let signer = SoftwareSigner::generate().unwrap();
        let payload = b"the way of the mandalorian";

        let signature = signer.sign(payload).unwrap();
        let valid = signer.verify(payload, &signature).unwrap();

        assert!(valid);
    }

    #[test]
    fn different_keys_produce_different_signatures() {
        let signer_a = SoftwareSigner::generate().unwrap();
        let signer_b = SoftwareSigner::generate().unwrap();
        let payload = b"this is the way";

        let sig_a = signer_a.sign(payload).unwrap();
        let sig_b = signer_b.sign(payload).unwrap();

        assert_ne!(sig_a, sig_b);
    }

    #[test]
    fn invalid_signature_rejected() {
        let signer = SoftwareSigner::generate().unwrap();
        let payload = b"beskar steel";
        let bad_signature = vec![0u8; 64];

        let valid = signer.verify(payload, &bad_signature).unwrap();
        assert!(!valid);
    }

    #[test]
    fn tampered_payload_rejected() {
        let signer = SoftwareSigner::generate().unwrap();
        let payload = b"original message";
        let signature = signer.sign(payload).unwrap();

        let valid = signer.verify(b"tampered message", &signature).unwrap();
        assert!(!valid);
    }

    #[test]
    fn did_format_is_correct() {
        let signer = SoftwareSigner::generate().unwrap();
        let did = signer.did();

        assert!(did.starts_with("did:forge:"));
        let suffix = &did["did:forge:".len()..];
        assert!(!suffix.is_empty());
        assert!(bs58::decode(suffix).into_vec().is_ok());
    }

    #[test]
    fn different_keys_produce_different_dids() {
        let signer_a = SoftwareSigner::generate().unwrap();
        let signer_b = SoftwareSigner::generate().unwrap();

        assert_ne!(signer_a.did(), signer_b.did());
    }
}
