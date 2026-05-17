use clap::{Parser, Subcommand};

use forge_crypto::{SigningProvider, SoftwareSigner};

#[derive(Parser)]
#[command(
    name = "forge",
    version,
    about = "The Forge Protocol - Developer Tools"
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Generate a new Ed25519 keypair and DID
    Keygen,
    /// Verify a Beskar manifest JSON file
    Verify {
        /// Path to the manifest JSON file
        path: String,
        /// Hex-encoded Ed25519 public key for signature verification
        #[arg(long)]
        pubkey: Option<String>,
    },
    /// Show information about the Forge protocol
    Info,
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::Keygen => cmd_keygen(),
        Commands::Verify { path, pubkey } => cmd_verify(&path, pubkey.as_deref()),
        Commands::Info => cmd_info(),
    }
}

fn cmd_keygen() {
    let signer = SoftwareSigner::generate().expect("failed to generate keypair");

    println!("DID:        {}", signer.did());
    println!("Public Key: {}", hex::encode(signer.public_key()));
    println!("Algorithm:  {:?}", signer.algorithm());
    println!();
    println!("Key generated (in-memory only).");
    println!("Persistent key storage requires Secure Enclave integration.");
}

fn cmd_verify(path: &str, pubkey_hex: Option<&str>) {
    let data = match std::fs::read(path) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("Error reading {path}: {e}");
            std::process::exit(1);
        }
    };

    let manifest: beskar_export::BeskarManifest = match serde_json::from_slice(&data) {
        Ok(m) => m,
        Err(e) => {
            eprintln!("Error parsing manifest: {e}");
            std::process::exit(1);
        }
    };

    println!("Claim Generator: {}", manifest.claim_generator);
    println!("Assertions:      {}", manifest.assertions.len());

    for assertion in &manifest.assertions {
        match assertion {
            beskar_export::ForgeAssertion::PurityGrade {
                grade,
                score,
                confidence,
            } => {
                println!("  [Purity]  grade={grade} score={score:.3} confidence={confidence:.3}");
            }
            beskar_export::ForgeAssertion::MerkleProof {
                root,
                leaf_count,
                proof_uri,
            } => {
                println!("  [Merkle]  root={} leaves={leaf_count}", &root[..16]);
                if let Some(uri) = proof_uri {
                    println!("            uri={uri}");
                }
            }
            beskar_export::ForgeAssertion::ChainCode {
                did,
                session_id,
                duration_ms,
                strike_count,
            } => {
                println!("  [Chain]   did={did}");
                println!("            session={session_id} strikes={strike_count} duration={duration_ms}ms");
            }
        }
    }

    println!("Signature:       {} bytes", manifest.signature.len());

    if let Some(pk_hex) = pubkey_hex {
        verify_signature(&manifest, pk_hex);
    } else {
        println!();
        println!("Tip: pass --pubkey <hex> to verify the signature cryptographically.");
    }
}

fn verify_signature(manifest: &beskar_export::BeskarManifest, pubkey_hex: &str) {
    let pubkey_bytes = match hex::decode(pubkey_hex) {
        Some(b) => b,
        None => {
            eprintln!("Error: invalid hex in --pubkey");
            std::process::exit(1);
        }
    };

    let payload = match serde_json::to_vec(&manifest.assertions) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Error re-serializing assertions: {e}");
            std::process::exit(1);
        }
    };

    use ring::signature::{UnparsedPublicKey, ED25519};
    let public_key = UnparsedPublicKey::new(&ED25519, &pubkey_bytes);

    match public_key.verify(&payload, &manifest.signature) {
        Ok(()) => {
            println!();
            println!("Signature:       VALID");
        }
        Err(_) => {
            println!();
            println!("Signature:       INVALID");
            std::process::exit(1);
        }
    }
}

fn cmd_info() {
    println!("The Forge Protocol v{}", env!("CARGO_PKG_VERSION"));
    println!();
    println!("A decentralized protocol proving human authorship of digital");
    println!("creative assets through cryptographic Proof-of-Process.");
    println!();
    println!("Components:");
    println!("  Anvil     - Edge daemon capturing creative events");
    println!("  Armorer   - Purity analysis engine (entropy/Hurst)");
    println!("  Beskar    - C2PA manifest export with signed proofs");
    println!("  Foundry   - Background ledger synchronization");
    println!();
    println!("This is the way.");
}

mod hex {
    pub fn encode(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }

    pub fn decode(s: &str) -> Option<Vec<u8>> {
        if !s.len().is_multiple_of(2) {
            return None;
        }
        (0..s.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok())
            .collect()
    }
}
