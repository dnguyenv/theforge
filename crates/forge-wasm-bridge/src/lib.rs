use std::cell::RefCell;
use std::collections::HashMap;

use ed25519_dalek::{Signer, SigningKey};
use sha2::{Digest, Sha256};
use wasm_bindgen::prelude::*;

type Hash = [u8; 32];

thread_local! {
    static STATE: RefCell<ForgeState> = RefCell::new(ForgeState::new());
}

struct ForgeState {
    signing_key: SigningKey,
    did: String,
    sessions: HashMap<String, Session>,
    events: Vec<EventRecord>,
}

struct Session {
    strike_count: u64,
    prev_hash: Hash,
    last_timestamp: u64,
    leaves: Vec<Hash>,
    started_at: u64,
}

#[derive(Clone, serde::Serialize)]
struct EventRecord {
    sequence_id: u64,
    timestamp_ms: u64,
    pressure: f32,
    velocity: f32,
    action: String,
}

impl ForgeState {
    fn new() -> Self {
        let mut csprng = rand_core::OsRng;
        let signing_key = SigningKey::generate(&mut csprng);
        let pubkey = signing_key.verifying_key().to_bytes();
        let hash = Sha256::digest(&pubkey);
        let did = format!("did:forge:{}", bs58_encode(&hash));

        Self {
            signing_key,
            did,
            sessions: HashMap::new(),
            events: Vec::new(),
        }
    }
}

fn bs58_encode(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 58] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    if bytes.is_empty() {
        return String::new();
    }
    let mut digits = vec![0u32];
    for &byte in bytes {
        let mut carry = byte as u32;
        for d in digits.iter_mut() {
            carry += *d * 256;
            *d = carry % 58;
            carry /= 58;
        }
        while carry > 0 {
            digits.push(carry % 58);
            carry /= 58;
        }
    }
    let leading_zeros = bytes.iter().take_while(|&&b| b == 0).count();
    let mut result = String::with_capacity(leading_zeros + digits.len());
    for _ in 0..leading_zeros {
        result.push('1');
    }
    for &d in digits.iter().rev() {
        result.push(ALPHABET[d as usize] as char);
    }
    result
}

fn compute_chain_hash(prev: &Hash, data: &[u8]) -> Hash {
    let mut hasher = Sha256::new();
    hasher.update(prev);
    hasher.update(data);
    hasher.finalize().into()
}

fn compute_merkle_root(leaves: &[Hash]) -> Hash {
    if leaves.is_empty() {
        return [0u8; 32];
    }
    if leaves.len() == 1 {
        return leaves[0];
    }
    let mut level = leaves.to_vec();
    while level.len() > 1 {
        let mut next = Vec::with_capacity((level.len() + 1) / 2);
        for chunk in level.chunks(2) {
            if chunk.len() == 2 {
                let mut hasher = Sha256::new();
                hasher.update(&chunk[0]);
                hasher.update(&chunk[1]);
                next.push(hasher.finalize().into());
            } else {
                next.push(chunk[0]);
            }
        }
        level = next;
    }
    level[0]
}

#[wasm_bindgen]
pub fn forge_init() -> String {
    STATE.with(|state| {
        let mut s = state.borrow_mut();
        let id = format!("sess-{:08x}", js_sys::Math::random().to_bits() as u32);
        let now = js_sys::Date::now() as u64;
        s.sessions.insert(
            id.clone(),
            Session {
                strike_count: 0,
                prev_hash: [0u8; 32],
                last_timestamp: 0,
                leaves: Vec::new(),
                started_at: now,
            },
        );
        s.events.clear();
        id
    })
}

#[wasm_bindgen]
pub fn forge_get_did() -> String {
    STATE.with(|state| state.borrow().did.clone())
}

#[wasm_bindgen]
pub fn forge_record_stroke(
    session_id: &str,
    sequence_id: u64,
    timestamp_ms: u64,
    pressure: f32,
    velocity: f32,
    x: f64,
    y: f64,
    duration_ms: u32,
) -> String {
    STATE.with(|state| {
        let mut s = state.borrow_mut();
        let session = match s.sessions.get_mut(session_id) {
            Some(sess) => sess,
            None => return "ERROR:session not found".into(),
        };

        let expected = session.strike_count + 1;
        if sequence_id != expected {
            return format!("ERROR:sequence violation, expected {expected} got {sequence_id}");
        }

        if timestamp_ms <= session.last_timestamp && session.last_timestamp > 0 {
            return format!("ERROR:timestamp not monotonic");
        }

        let data = format!(
            "{}:{}:{}:{:.3}:{:.1}:{:.1}:{:.1}:{}",
            session_id, sequence_id, timestamp_ms, pressure, velocity, x, y, duration_ms
        );

        let delta_hash = compute_chain_hash(&session.prev_hash, data.as_bytes());
        session.prev_hash = delta_hash;
        session.leaves.push(delta_hash);
        session.strike_count += 1;
        session.last_timestamp = timestamp_ms;

        s.events.push(EventRecord {
            sequence_id,
            timestamp_ms,
            pressure,
            velocity,
            action: "BrushStroke".into(),
        });

        hex_encode(&delta_hash)
    })
}

#[wasm_bindgen]
pub fn forge_get_strike_count(session_id: &str) -> u64 {
    STATE.with(|state| {
        state
            .borrow()
            .sessions
            .get(session_id)
            .map(|s| s.strike_count)
            .unwrap_or(0)
    })
}

#[wasm_bindgen]
pub fn forge_analyze() -> String {
    STATE.with(|state| {
        let s = state.borrow();
        let events = &s.events;

        if events.len() < 20 {
            return format!(
                "{{\"error\":\"need at least 20 strokes, have {}\"}}",
                events.len()
            );
        }

        let intervals: Vec<f64> = events
            .windows(2)
            .map(|w| (w[1].timestamp_ms as f64) - (w[0].timestamp_ms as f64))
            .collect();

        let mean_interval = intervals.iter().sum::<f64>() / intervals.len() as f64;
        let std_interval = (intervals
            .iter()
            .map(|x| (x - mean_interval).powi(2))
            .sum::<f64>()
            / intervals.len() as f64)
            .sqrt();
        let timing_cv = if mean_interval > 0.0 {
            (std_interval / mean_interval).min(1.0)
        } else {
            0.0
        };

        let pressures: Vec<f64> = events.iter().map(|e| e.pressure as f64).collect();
        let mean_p = pressures.iter().sum::<f64>() / pressures.len() as f64;
        let std_p = (pressures
            .iter()
            .map(|x| (x - mean_p).powi(2))
            .sum::<f64>()
            / pressures.len() as f64)
            .sqrt();
        let pressure_score = (std_p / 0.2).min(1.0);

        let velocity_scores: Vec<f64> = events.iter().map(|e| e.velocity as f64).collect();
        let mean_v = velocity_scores.iter().sum::<f64>() / velocity_scores.len() as f64;
        let mut autocorr_num = 0.0;
        let mut autocorr_den = 0.0;
        for i in 0..velocity_scores.len() - 1 {
            autocorr_num +=
                (velocity_scores[i] - mean_v) * (velocity_scores[i + 1] - mean_v);
        }
        for v in &velocity_scores {
            autocorr_den += (v - mean_v).powi(2);
        }
        let autocorr = if autocorr_den > 0.0 {
            (autocorr_num / autocorr_den).abs()
        } else {
            0.5
        };
        let velocity_score = (1.0 - autocorr).max(0.0).min(1.0);

        let score = timing_cv * 0.35 + pressure_score * 0.30 + velocity_score * 0.35;
        let grade = if score >= 0.95 {
            "Masterwork"
        } else if score >= 0.80 {
            "HandForged"
        } else if score >= 0.50 {
            "Assisted"
        } else {
            "Synthetic"
        };

        let confidence = (events.len() as f64 / 500.0).min(1.0);

        format!(
            "{{\"grade\":\"{grade}\",\"score\":{score:.4},\"confidence\":{confidence:.3},\"features\":{{\"timing_jitter\":{timing_cv:.4},\"pressure_variance\":{pressure_score:.4},\"velocity_autocorrelation\":{velocity_score:.4}}}}}",
        )
    })
}

#[wasm_bindgen]
pub fn forge_export(session_id: &str) -> String {
    STATE.with(|state| {
        let s = state.borrow();
        let session = match s.sessions.get(session_id) {
            Some(sess) => sess,
            None => return "{\"error\":\"session not found\"}".into(),
        };

        if session.leaves.is_empty() {
            return "{\"error\":\"no strokes recorded\"}".into();
        }

        let merkle_root = compute_merkle_root(&session.leaves);
        let root_hex = hex_encode(&merkle_root);

        let now = js_sys::Date::now() as u64;
        let duration_ms = now.saturating_sub(session.started_at);

        // Sign the assertions payload
        let assertions = format!(
            "[{{\"type\":\"forge.purity_grade\",\"grade\":\"pending\",\"score\":0,\"confidence\":0}},{{\"type\":\"forge.merkle_proof\",\"root\":\"{root_hex}\",\"leaf_count\":{}}},{{\"type\":\"forge.chain_code\",\"did\":\"{}\",\"session_id\":\"{session_id}\",\"duration_ms\":{duration_ms},\"strike_count\":{}}}]",
            session.leaves.len(),
            s.did,
            session.strike_count
        );

        let signature = s.signing_key.sign(assertions.as_bytes());
        let sig_hex = hex_encode(&signature.to_bytes());

        format!(
            "{{\"claim_generator\":\"TheForge/0.1.0-wasm\",\"assertions\":{assertions},\"signature\":\"{sig_hex}\",\"public_key\":\"{}\"}}",
            hex_encode(&s.signing_key.verifying_key().to_bytes())
        )
    })
}

#[wasm_bindgen]
pub fn forge_reset() {
    STATE.with(|state| {
        *state.borrow_mut() = ForgeState::new();
    });
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
