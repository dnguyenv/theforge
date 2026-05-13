use serde::{Deserialize, Serialize};

use armorer_core::PurityGrade;
use forge_crypto::{CryptoError, SigningProvider};
use forge_merkle::Hash;

use crate::ExportError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BeskarManifest {
    pub claim_generator: String,
    pub assertions: Vec<ForgeAssertion>,
    pub signature: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ForgeAssertion {
    #[serde(rename = "forge.purity_grade")]
    PurityGrade {
        grade: String,
        score: f64,
        confidence: f64,
    },
    #[serde(rename = "forge.merkle_proof")]
    MerkleProof {
        root: String,
        leaf_count: usize,
        #[serde(skip_serializing_if = "Option::is_none")]
        proof_uri: Option<String>,
    },
    #[serde(rename = "forge.chain_code")]
    ChainCode {
        did: String,
        session_id: String,
        duration_ms: u64,
        strike_count: u64,
    },
}

pub struct ManifestBuilder {
    assertions: Vec<ForgeAssertion>,
    session_id: String,
}

impl ManifestBuilder {
    pub fn new(session_id: &str) -> Self {
        Self {
            assertions: Vec::new(),
            session_id: session_id.to_string(),
        }
    }

    pub fn purity(mut self, grade: PurityGrade, score: f64, confidence: f64) -> Self {
        self.assertions.push(ForgeAssertion::PurityGrade {
            grade: format!("{grade:?}"),
            score,
            confidence,
        });
        self
    }

    pub fn merkle(mut self, root: Hash, leaf_count: usize, proof_uri: Option<String>) -> Self {
        let root_hex = root.iter().map(|b| format!("{b:02x}")).collect::<String>();
        self.assertions.push(ForgeAssertion::MerkleProof {
            root: root_hex,
            leaf_count,
            proof_uri,
        });
        self
    }

    pub fn chain_code(mut self, did: &str, duration_ms: u64, strike_count: u64) -> Self {
        self.assertions.push(ForgeAssertion::ChainCode {
            did: did.to_string(),
            session_id: self.session_id.clone(),
            duration_ms,
            strike_count,
        });
        self
    }

    pub fn build(self, signer: &dyn SigningProvider) -> Result<BeskarManifest, ExportError> {
        let payload = serde_json::to_vec(&self.assertions)?;
        let signature = signer
            .sign(&payload)
            .map_err(|e: CryptoError| ExportError::Signing(e.to_string()))?;

        Ok(BeskarManifest {
            claim_generator: "TheForge/0.1.0".to_string(),
            assertions: self.assertions,
            signature,
        })
    }

    pub fn to_jumbf_json(manifest: &BeskarManifest) -> Result<Vec<u8>, ExportError> {
        Ok(serde_json::to_vec_pretty(manifest)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use armorer_core::PurityGrade;
    use forge_crypto::SoftwareSigner;

    #[test]
    fn build_manifest_with_all_assertions() {
        let signer = SoftwareSigner::generate().unwrap();
        let root = [0xab; 32];

        let manifest = ManifestBuilder::new("sess-123")
            .purity(PurityGrade::Masterwork, 0.97, 0.95)
            .merkle(root, 1500, Some("ar://txid123".into()))
            .chain_code(signer.did(), 72_000_000, 1500)
            .build(&signer)
            .unwrap();

        assert_eq!(manifest.claim_generator, "TheForge/0.1.0");
        assert_eq!(manifest.assertions.len(), 3);
        assert!(!manifest.signature.is_empty());
    }

    #[test]
    fn manifest_signature_is_verifiable() {
        let signer = SoftwareSigner::generate().unwrap();

        let manifest = ManifestBuilder::new("sess-456")
            .purity(PurityGrade::HandForged, 0.88, 0.90)
            .build(&signer)
            .unwrap();

        let payload = serde_json::to_vec(&manifest.assertions).unwrap();
        let valid = signer.verify(&payload, &manifest.signature).unwrap();
        assert!(valid);
    }

    #[test]
    fn jumbf_json_output() {
        let signer = SoftwareSigner::generate().unwrap();

        let manifest = ManifestBuilder::new("sess-789")
            .purity(PurityGrade::Assisted, 0.65, 0.80)
            .build(&signer)
            .unwrap();

        let json = ManifestBuilder::to_jumbf_json(&manifest).unwrap();
        let parsed: serde_json::Value = serde_json::from_slice(&json).unwrap();

        assert_eq!(parsed["claim_generator"], "TheForge/0.1.0");
        assert!(parsed["assertions"].is_array());
    }

    #[test]
    fn merkle_root_hex_encoding() {
        let signer = SoftwareSigner::generate().unwrap();
        let root = [0xff; 32];

        let manifest = ManifestBuilder::new("s")
            .merkle(root, 100, None)
            .build(&signer)
            .unwrap();

        if let ForgeAssertion::MerkleProof { root: hex, .. } = &manifest.assertions[0] {
            assert_eq!(hex, &"ff".repeat(32));
        } else {
            panic!("expected MerkleProof assertion");
        }
    }
}
