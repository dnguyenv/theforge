mod analyzer;
mod features;

use anvil_event_bus::StrikeEvent;
use serde::{Deserialize, Serialize};
use thiserror::Error;

pub use analyzer::RuleBasedAnalyzer;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PurityGrade {
    Masterwork,
    HandForged,
    Assisted,
    Synthetic,
}

impl PurityGrade {
    pub fn from_score(score: f64) -> Self {
        match score {
            s if s >= 0.95 => Self::Masterwork,
            s if s >= 0.80 => Self::HandForged,
            s if s >= 0.50 => Self::Assisted,
            _ => Self::Synthetic,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PurityReport {
    pub grade: PurityGrade,
    pub score: f64,
    pub confidence: f64,
    pub features: FeatureScores,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FeatureScores {
    pub shannon_entropy: f64,
    pub hurst_exponent: f64,
    pub timing_jitter: f64,
    pub pressure_variance: f64,
    pub velocity_autocorrelation: f64,
    pub action_transition_entropy: f64,
    pub pause_distribution_fit: f64,
    pub burst_density_variance: f64,
}

#[derive(Debug, Error)]
pub enum ArmorerError {
    #[error("insufficient data: need at least {min} events, got {got}")]
    InsufficientData { min: usize, got: usize },
    #[error("analysis failed: {0}")]
    AnalysisFailed(String),
}

pub trait PurityAnalyzer: Send + Sync {
    fn analyze(&self, events: &[StrikeEvent]) -> Result<PurityReport, ArmorerError>;
}
