use thiserror::Error;

pub type Hash = [u8; 32];

#[derive(Debug, Error)]
pub enum MerkleError {
    #[error("tree is empty")]
    Empty,
    #[error("invalid proof")]
    InvalidProof,
}

pub struct MerkleTree {
    leaves: Vec<Hash>,
}

impl MerkleTree {
    pub fn new() -> Self {
        Self { leaves: Vec::new() }
    }

    pub fn append(&mut self, data: &[u8]) -> Hash {
        let hash = Self::hash_leaf(data);
        self.leaves.push(hash);
        hash
    }

    pub fn root(&self) -> Result<Hash, MerkleError> {
        if self.leaves.is_empty() {
            return Err(MerkleError::Empty);
        }
        Ok(self.compute_root(&self.leaves))
    }

    pub fn leaf_count(&self) -> usize {
        self.leaves.len()
    }

    pub fn proof(&self, index: usize) -> Result<MerkleProof, MerkleError> {
        if self.leaves.is_empty() {
            return Err(MerkleError::Empty);
        }
        let root = self.compute_root(&self.leaves);
        Ok(MerkleProof { index, root })
    }

    fn hash_leaf(data: &[u8]) -> Hash {
        use ring::digest;
        let result = digest::digest(&digest::SHA256, data);
        let mut hash = [0u8; 32];
        hash.copy_from_slice(result.as_ref());
        hash
    }

    fn compute_root(&self, leaves: &[Hash]) -> Hash {
        if leaves.len() == 1 {
            return leaves[0];
        }

        let mut next_level = Vec::new();
        for chunk in leaves.chunks(2) {
            if chunk.len() == 2 {
                next_level.push(Self::hash_pair(&chunk[0], &chunk[1]));
            } else {
                next_level.push(chunk[0]);
            }
        }
        self.compute_root(&next_level)
    }

    fn hash_pair(left: &Hash, right: &Hash) -> Hash {
        use ring::digest;
        let mut combined = Vec::with_capacity(64);
        combined.extend_from_slice(left);
        combined.extend_from_slice(right);
        let result = digest::digest(&digest::SHA256, &combined);
        let mut hash = [0u8; 32];
        hash.copy_from_slice(result.as_ref());
        hash
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
    pub root: Hash,
}
