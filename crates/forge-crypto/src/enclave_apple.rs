use std::ffi::c_void;

use core_foundation::base::TCFType;
use core_foundation::boolean::CFBoolean;
use core_foundation::dictionary::CFDictionary;
use core_foundation::number::CFNumber;
use core_foundation::string::CFString;
use security_framework::key::{Algorithm, SecKey};
use security_framework_sys::item::{
    kSecAttrIsPermanent, kSecAttrKeySizeInBits, kSecAttrKeyType, kSecAttrKeyTypeECSECPrimeRandom,
    kSecAttrTokenID, kSecAttrTokenIDSecureEnclave, kSecPrivateKeyAttrs,
};

use crate::did::generate_did;
use crate::error::CryptoError;
use crate::signer::{SignatureAlgorithm, SigningProvider};

pub struct EnclaveSignerApple {
    private_key: SecKey,
    public_key_bytes: Vec<u8>,
    did: String,
}

impl EnclaveSignerApple {
    /// Create a new P-256 key in the Secure Enclave.
    pub fn create_new() -> Result<Self, CryptoError> {
        let private_key_attrs = unsafe {
            CFDictionary::from_CFType_pairs(&[(
                CFString::wrap_under_get_rule(kSecAttrIsPermanent).as_CFType(),
                CFBoolean::false_value().as_CFType(),
            )])
        };

        let attributes = unsafe {
            CFDictionary::from_CFType_pairs(&[
                (
                    CFString::wrap_under_get_rule(kSecAttrKeyType).as_CFType(),
                    CFString::wrap_under_get_rule(kSecAttrKeyTypeECSECPrimeRandom).as_CFType(),
                ),
                (
                    CFString::wrap_under_get_rule(kSecAttrKeySizeInBits).as_CFType(),
                    CFNumber::from(256i32).as_CFType(),
                ),
                (
                    CFString::wrap_under_get_rule(kSecAttrTokenID).as_CFType(),
                    CFString::wrap_under_get_rule(kSecAttrTokenIDSecureEnclave).as_CFType(),
                ),
                (
                    CFString::wrap_under_get_rule(kSecPrivateKeyAttrs).as_CFType(),
                    private_key_attrs.as_CFType(),
                ),
            ])
        };

        let raw_dict = unsafe {
            CFDictionary::<*const c_void, *const c_void>::wrap_under_get_rule(
                attributes.as_concrete_TypeRef() as *const _,
            )
        };

        let private_key =
            SecKey::generate(raw_dict).map_err(|e| CryptoError::KeyGeneration(e.to_string()))?;

        Self::from_private_key(private_key)
    }

    /// Create an in-memory P-256 key (software fallback, same API surface).
    pub fn create_software_fallback() -> Result<Self, CryptoError> {
        let attributes = unsafe {
            CFDictionary::from_CFType_pairs(&[
                (
                    CFString::wrap_under_get_rule(kSecAttrKeyType).as_CFType(),
                    CFString::wrap_under_get_rule(kSecAttrKeyTypeECSECPrimeRandom).as_CFType(),
                ),
                (
                    CFString::wrap_under_get_rule(kSecAttrKeySizeInBits).as_CFType(),
                    CFNumber::from(256i32).as_CFType(),
                ),
            ])
        };

        let raw_dict = unsafe {
            CFDictionary::<*const c_void, *const c_void>::wrap_under_get_rule(
                attributes.as_concrete_TypeRef() as *const _,
            )
        };

        let private_key =
            SecKey::generate(raw_dict).map_err(|e| CryptoError::KeyGeneration(e.to_string()))?;

        Self::from_private_key(private_key)
    }

    fn from_private_key(private_key: SecKey) -> Result<Self, CryptoError> {
        let public_key = private_key
            .public_key()
            .ok_or_else(|| CryptoError::KeyGeneration("failed to derive public key".into()))?;

        let public_key_bytes = public_key
            .external_representation()
            .ok_or_else(|| CryptoError::KeyGeneration("failed to export public key".into()))?
            .to_vec();

        let did = generate_did(&public_key_bytes);

        Ok(Self {
            private_key,
            public_key_bytes,
            did,
        })
    }
}

impl SigningProvider for EnclaveSignerApple {
    fn sign(&self, payload: &[u8]) -> Result<Vec<u8>, CryptoError> {
        let signature = self
            .private_key
            .create_signature(Algorithm::ECDSASignatureMessageX962SHA256, payload)
            .map_err(|e| CryptoError::Signing(e.to_string()))?;

        Ok(signature.to_vec())
    }

    fn public_key(&self) -> &[u8] {
        &self.public_key_bytes
    }

    fn algorithm(&self) -> SignatureAlgorithm {
        SignatureAlgorithm::EcdsaP256
    }

    fn did(&self) -> &str {
        &self.did
    }

    fn verify(&self, payload: &[u8], signature: &[u8]) -> Result<bool, CryptoError> {
        let public_key = self
            .private_key
            .public_key()
            .ok_or_else(|| CryptoError::Verification("no public key".into()))?;

        match public_key.verify_signature(
            Algorithm::ECDSASignatureMessageX962SHA256,
            payload,
            signature,
        ) {
            Ok(true) => Ok(true),
            Ok(false) | Err(_) => Ok(false),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn software_fallback_sign_verify() {
        let signer = EnclaveSignerApple::create_software_fallback().unwrap();

        assert!(!signer.public_key().is_empty());
        assert!(signer.did().starts_with("did:forge:"));
        assert_eq!(signer.algorithm(), SignatureAlgorithm::EcdsaP256);

        let payload = b"beskar is the strongest metal";
        let sig = signer.sign(payload).unwrap();
        assert!(!sig.is_empty());

        assert!(signer.verify(payload, &sig).unwrap());
        assert!(!signer.verify(b"wrong payload", &sig).unwrap());
    }

    #[test]
    fn different_keys_different_dids() {
        let a = EnclaveSignerApple::create_software_fallback().unwrap();
        let b = EnclaveSignerApple::create_software_fallback().unwrap();
        assert_ne!(a.did(), b.did());
    }

    #[test]
    fn enclave_key_if_available() {
        match EnclaveSignerApple::create_new() {
            Ok(signer) => {
                let sig = signer.sign(b"test").unwrap();
                assert!(signer.verify(b"test", &sig).unwrap());
            }
            Err(_) => {
                // Expected on CI / VMs / Intel Macs without SE
            }
        }
    }
}
