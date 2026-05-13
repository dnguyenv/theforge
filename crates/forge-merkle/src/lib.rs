use ring::digest;
use thiserror::Error;

pub type Hash = [u8; 32];

#[derive(Debug, Error)]
pub enum MerkleError {
    #[error("tree is empty")]
    Empty,
    #[error("invalid proof")]
    InvalidProof,
    #[error("index out of bounds: {index} >= {count}")]
    IndexOutOfBounds { index: usize, count: usize },
}

pub struct MerkleTree {
    leaves: Vec<Hash>,
}

impl MerkleTree {
    pub fn new() -> Self {
        Self { leaves: Vec::new() }
    }

    pub fn append(&mut self, data: &[u8]) -> Hash {
        let hash = hash_leaf(data);
        self.leaves.push(hash);
        hash
    }

    pub fn root(&self) -> Result<Hash, MerkleError> {
        if self.leaves.is_empty() {
            return Err(MerkleError::Empty);
        }
        Ok(compute_root(&self.leaves))
    }

    pub fn leaf_count(&self) -> usize {
        self.leaves.len()
    }

    pub fn proof(&self, index: usize) -> Result<MerkleProof, MerkleError> {
        if self.leaves.is_empty() {
            return Err(MerkleError::Empty);
        }
        if index >= self.leaves.len() {
            return Err(MerkleError::IndexOutOfBounds {
                index,
                count: self.leaves.len(),
            });
        }

        let siblings = collect_siblings(&self.leaves, index);
        let root = compute_root(&self.leaves);

        Ok(MerkleProof {
            index,
            leaf: self.leaves[index],
            siblings,
            root,
        })
    }
}

impl Default for MerkleTree {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
pub struct MerkleProof {
    pub index: usize,
    pub leaf: Hash,
    pub siblings: Vec<(Hash, Side)>,
    pub root: Hash,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    Left,
    Right,
}

impl MerkleProof {
    pub fn verify(&self) -> bool {
        let mut current = self.leaf;

        for (sibling, side) in &self.siblings {
            current = match side {
                Side::Left => hash_pair(sibling, &current),
                Side::Right => hash_pair(&current, sibling),
            };
        }

        current == self.root
    }
}

fn collect_siblings(leaves: &[Hash], index: usize) -> Vec<(Hash, Side)> {
    let mut siblings = Vec::new();
    let mut level = leaves.to_vec();
    let mut idx = index;

    while level.len() > 1 {
        if idx % 2 == 0 {
            if idx + 1 < level.len() {
                siblings.push((level[idx + 1], Side::Right));
            }
            // If no right sibling, this node promotes alone — no sibling needed
        } else {
            siblings.push((level[idx - 1], Side::Left));
        }

        let mut next_level = Vec::new();
        for chunk in level.chunks(2) {
            if chunk.len() == 2 {
                next_level.push(hash_pair(&chunk[0], &chunk[1]));
            } else {
                next_level.push(chunk[0]);
            }
        }
        level = next_level;
        idx /= 2;
    }

    siblings
}

fn compute_root(leaves: &[Hash]) -> Hash {
    if leaves.len() == 1 {
        return leaves[0];
    }

    let mut level = leaves.to_vec();
    while level.len() > 1 {
        let mut next = Vec::with_capacity((level.len() + 1) / 2);
        for chunk in level.chunks(2) {
            if chunk.len() == 2 {
                next.push(hash_pair(&chunk[0], &chunk[1]));
            } else {
                next.push(chunk[0]);
            }
        }
        level = next;
    }
    level[0]
}

fn hash_leaf(data: &[u8]) -> Hash {
    let result = digest::digest(&digest::SHA256, data);
    let mut hash = [0u8; 32];
    hash.copy_from_slice(result.as_ref());
    hash
}

fn hash_pair(left: &Hash, right: &Hash) -> Hash {
    let mut combined = [0u8; 64];
    combined[..32].copy_from_slice(left);
    combined[32..].copy_from_slice(right);
    let result = digest::digest(&digest::SHA256, &combined);
    let mut hash = [0u8; 32];
    hash.copy_from_slice(result.as_ref());
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_tree_returns_error() {
        let tree = MerkleTree::new();
        assert!(matches!(tree.root(), Err(MerkleError::Empty)));
    }

    #[test]
    fn single_leaf_root_is_leaf_hash() {
        let mut tree = MerkleTree::new();
        let leaf = tree.append(b"hello");
        assert_eq!(tree.root().unwrap(), leaf);
    }

    #[test]
    fn two_leaves_root_is_hash_of_pair() {
        let mut tree = MerkleTree::new();
        let a = tree.append(b"a");
        let b = tree.append(b"b");
        let expected = hash_pair(&a, &b);
        assert_eq!(tree.root().unwrap(), expected);
    }

    #[test]
    fn root_changes_on_append() {
        let mut tree = MerkleTree::new();
        tree.append(b"first");
        let root1 = tree.root().unwrap();
        tree.append(b"second");
        let root2 = tree.root().unwrap();
        assert_ne!(root1, root2);
    }

    #[test]
    fn deterministic_roots() {
        let mut t1 = MerkleTree::new();
        let mut t2 = MerkleTree::new();
        for i in 0..10u8 {
            t1.append(&[i]);
            t2.append(&[i]);
        }
        assert_eq!(t1.root().unwrap(), t2.root().unwrap());
    }

    #[test]
    fn proof_verifies_for_each_leaf() {
        let mut tree = MerkleTree::new();
        for i in 0..7u8 {
            tree.append(&[i]);
        }
        for i in 0..7 {
            let proof = tree.proof(i).unwrap();
            assert!(proof.verify(), "proof failed for index {i}");
        }
    }

    #[test]
    fn proof_out_of_bounds() {
        let mut tree = MerkleTree::new();
        tree.append(b"x");
        assert!(matches!(
            tree.proof(5),
            Err(MerkleError::IndexOutOfBounds { .. })
        ));
    }

    #[test]
    fn tampered_proof_fails() {
        let mut tree = MerkleTree::new();
        for i in 0..4u8 {
            tree.append(&[i]);
        }
        let mut proof = tree.proof(1).unwrap();
        proof.leaf = [0xff; 32];
        assert!(!proof.verify());
    }

    #[test]
    fn leaf_count_tracks_appends() {
        let mut tree = MerkleTree::new();
        assert_eq!(tree.leaf_count(), 0);
        tree.append(b"a");
        assert_eq!(tree.leaf_count(), 1);
        tree.append(b"b");
        tree.append(b"c");
        assert_eq!(tree.leaf_count(), 3);
    }
}
