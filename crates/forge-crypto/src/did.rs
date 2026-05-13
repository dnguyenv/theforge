use ring::digest;

pub fn generate_did(public_key: &[u8]) -> String {
    let hash = digest::digest(&digest::SHA256, public_key);
    let encoded = bs58::encode(hash.as_ref()).into_string();
    format!("did:forge:{encoded}")
}
