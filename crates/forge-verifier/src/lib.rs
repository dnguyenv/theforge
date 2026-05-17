use ring::digest;
use thiserror::Error;

use forge_merkle::{Hash, MerkleTree};

#[derive(Debug, Error)]
pub enum VerifyError {
    #[error("hash chain broken at index {index}: expected {expected}, got {actual}")]
    BrokenChain {
        index: usize,
        expected: String,
        actual: String,
    },
    #[error("merkle root mismatch: expected {expected}, got {actual}")]
    MerkleRootMismatch { expected: String, actual: String },
    #[error("timestamp not monotonic at index {index}: {timestamp} <= {previous}")]
    TimestampViolation {
        index: usize,
        previous: u64,
        timestamp: u64,
    },
    #[error("sequence gap at index {index}: expected {expected}, got {got}")]
    SequenceGap {
        index: usize,
        expected: u64,
        got: u64,
    },
    #[error("empty event log")]
    Empty,
}

/// A stored event as read from the database or export file.
#[derive(Debug, Clone)]
pub struct StoredStrike {
    pub sequence_id: u64,
    pub timestamp_ms: u64,
    pub data: Vec<u8>,
    pub delta_hash: Hash,
}

/// Result of verification.
#[derive(Debug, Clone)]
pub struct VerificationResult {
    pub valid: bool,
    pub event_count: usize,
    pub merkle_root: Hash,
}

/// Independently verify a session's event log.
/// Reconstructs the hash chain and Merkle tree from raw events and checks:
/// 1. Sequence IDs are monotonically increasing (1, 2, 3, ...)
/// 2. Timestamps are strictly monotonic
/// 3. Each delta_hash = SHA256(prev_hash || data), chaining correctly
/// 4. Merkle root matches expected (if provided)
pub fn verify_session(
    events: &[StoredStrike],
    expected_root: Option<&Hash>,
) -> Result<VerificationResult, VerifyError> {
    if events.is_empty() {
        return Err(VerifyError::Empty);
    }

    let mut prev_hash: Hash = [0u8; 32];
    let mut prev_timestamp = 0u64;
    let mut tree = MerkleTree::new();

    for (i, event) in events.iter().enumerate() {
        let expected_seq = (i as u64) + 1;
        if event.sequence_id != expected_seq {
            return Err(VerifyError::SequenceGap {
                index: i,
                expected: expected_seq,
                got: event.sequence_id,
            });
        }

        if i > 0 && event.timestamp_ms <= prev_timestamp {
            return Err(VerifyError::TimestampViolation {
                index: i,
                previous: prev_timestamp,
                timestamp: event.timestamp_ms,
            });
        }

        let computed_hash = compute_chain_hash(&prev_hash, &event.data);
        if computed_hash != event.delta_hash {
            return Err(VerifyError::BrokenChain {
                index: i,
                expected: hex_encode(&computed_hash),
                actual: hex_encode(&event.delta_hash),
            });
        }

        tree.append(&computed_hash);
        prev_hash = computed_hash;
        prev_timestamp = event.timestamp_ms;
    }

    let root = tree.root().unwrap();

    if let Some(expected) = expected_root {
        if &root != expected {
            return Err(VerifyError::MerkleRootMismatch {
                expected: hex_encode(expected),
                actual: hex_encode(&root),
            });
        }
    }

    Ok(VerificationResult {
        valid: true,
        event_count: events.len(),
        merkle_root: root,
    })
}

fn compute_chain_hash(prev_hash: &Hash, data: &[u8]) -> Hash {
    let mut input = Vec::with_capacity(32 + data.len());
    input.extend_from_slice(prev_hash);
    input.extend_from_slice(data);
    let result = digest::digest(&digest::SHA256, &input);
    let mut hash = [0u8; 32];
    hash.copy_from_slice(result.as_ref());
    hash
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_valid_events(n: usize) -> (Vec<StoredStrike>, Hash) {
        let mut events = Vec::new();
        let mut prev_hash: Hash = [0u8; 32];
        let mut tree = MerkleTree::new();

        for i in 0..n {
            let data = format!("event-{i}").into_bytes();
            let delta_hash = compute_chain_hash(&prev_hash, &data);
            tree.append(&delta_hash);

            events.push(StoredStrike {
                sequence_id: (i as u64) + 1,
                timestamp_ms: 1000 + (i as u64) * 100,
                data,
                delta_hash,
            });

            prev_hash = delta_hash;
        }

        let root = tree.root().unwrap();
        (events, root)
    }

    #[test]
    fn valid_session_passes() {
        let (events, root) = make_valid_events(50);
        let result = verify_session(&events, Some(&root)).unwrap();
        assert!(result.valid);
        assert_eq!(result.event_count, 50);
        assert_eq!(result.merkle_root, root);
    }

    #[test]
    fn detects_broken_hash_chain() {
        let (mut events, _) = make_valid_events(10);
        events[5].delta_hash = [0xFF; 32]; // corrupt one hash

        let err = verify_session(&events, None).unwrap_err();
        assert!(matches!(err, VerifyError::BrokenChain { index: 5, .. }));
    }

    #[test]
    fn detects_tampered_data() {
        let (mut events, _) = make_valid_events(10);
        events[3].data = b"tampered".to_vec(); // data changed but hash unchanged

        let err = verify_session(&events, None).unwrap_err();
        assert!(matches!(err, VerifyError::BrokenChain { index: 3, .. }));
    }

    #[test]
    fn detects_sequence_gap() {
        let (mut events, _) = make_valid_events(10);
        events[4].sequence_id = 10; // skip

        let err = verify_session(&events, None).unwrap_err();
        assert!(matches!(
            err,
            VerifyError::SequenceGap {
                index: 4,
                expected: 5,
                got: 10
            }
        ));
    }

    #[test]
    fn detects_non_monotonic_timestamp() {
        let (mut events, _) = make_valid_events(10);
        events[6].timestamp_ms = events[5].timestamp_ms; // equal = violation

        let err = verify_session(&events, None).unwrap_err();
        assert!(matches!(
            err,
            VerifyError::TimestampViolation { index: 6, .. }
        ));
    }

    #[test]
    fn detects_merkle_root_mismatch() {
        let (events, _) = make_valid_events(10);
        let wrong_root = [0xAA; 32];

        let err = verify_session(&events, Some(&wrong_root)).unwrap_err();
        assert!(matches!(err, VerifyError::MerkleRootMismatch { .. }));
    }

    #[test]
    fn empty_log_errors() {
        let err = verify_session(&[], None).unwrap_err();
        assert!(matches!(err, VerifyError::Empty));
    }

    #[test]
    fn detects_deleted_event() {
        let (mut events, root) = make_valid_events(10);
        events.remove(5); // delete event at index 5

        // This breaks both sequence and hash chain
        let err = verify_session(&events, Some(&root)).unwrap_err();
        assert!(matches!(
            err,
            VerifyError::SequenceGap { .. } | VerifyError::BrokenChain { .. }
        ));
    }

    #[test]
    fn detects_inserted_event() {
        let (mut events, root) = make_valid_events(10);
        let fake = StoredStrike {
            sequence_id: 4,
            timestamp_ms: 1350,
            data: b"injected".to_vec(),
            delta_hash: [0x00; 32],
        };
        events.insert(3, fake); // inject after event 3

        // Duplicate sequence_id 4
        let err = verify_session(&events, Some(&root)).unwrap_err();
        assert!(matches!(err, VerifyError::BrokenChain { .. }));
    }
}
