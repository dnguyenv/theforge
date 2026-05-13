use anvil_event_bus::StrikeEvent;

use crate::features;
use crate::{ArmorerError, FeatureScores, PurityAnalyzer, PurityGrade, PurityReport};

const MIN_EVENTS: usize = 20;

const W_SHANNON: f64 = 0.15;
const W_HURST: f64 = 0.20;
const W_TIMING: f64 = 0.20;
const W_PRESSURE: f64 = 0.10;
const W_VELOCITY: f64 = 0.10;
const W_TRANSITION: f64 = 0.10;
const W_PAUSE: f64 = 0.10;
const W_BURST: f64 = 0.05;

pub struct RuleBasedAnalyzer;

impl RuleBasedAnalyzer {
    pub fn new() -> Self {
        Self
    }
}

impl Default for RuleBasedAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

impl PurityAnalyzer for RuleBasedAnalyzer {
    fn analyze(&self, events: &[StrikeEvent]) -> Result<PurityReport, ArmorerError> {
        if events.len() < MIN_EVENTS {
            return Err(ArmorerError::InsufficientData {
                min: MIN_EVENTS,
                got: events.len(),
            });
        }

        let scores = FeatureScores {
            shannon_entropy: features::shannon_entropy(events),
            hurst_exponent: hurst_score(features::hurst_exponent(events)),
            timing_jitter: features::timing_jitter(events),
            pressure_variance: features::pressure_variance(events),
            velocity_autocorrelation: features::velocity_autocorrelation(events),
            action_transition_entropy: features::action_transition_entropy(events),
            pause_distribution_fit: features::pause_distribution_fit(events),
            burst_density_variance: features::burst_density_variance(events),
        };

        let composite = W_SHANNON * scores.shannon_entropy
            + W_HURST * scores.hurst_exponent
            + W_TIMING * scores.timing_jitter
            + W_PRESSURE * scores.pressure_variance
            + W_VELOCITY * scores.velocity_autocorrelation
            + W_TRANSITION * scores.action_transition_entropy
            + W_PAUSE * scores.pause_distribution_fit
            + W_BURST * scores.burst_density_variance;

        let confidence = confidence_from_sample_size(events.len());

        Ok(PurityReport {
            grade: PurityGrade::from_score(composite),
            score: composite,
            confidence,
            features: scores,
        })
    }
}

// Hurst exponent scoring: H~0.5 = random (human), H~1.0 = persistent (scripted)
// Convert to 0-1 scale where 1 = human
fn hurst_score(h: f64) -> f64 {
    let deviation = (h - 0.5).abs();
    // deviation 0 = perfectly random (human), deviation 0.5 = perfectly persistent (bot)
    (1.0 - deviation * 2.0).clamp(0.0, 1.0)
}

fn confidence_from_sample_size(n: usize) -> f64 {
    // Confidence ramps up with sample size, saturates around 500 events
    let ratio = n as f64 / 500.0;
    ratio.min(1.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use anvil_event_bus::{ActionType, Telemetry};

    fn make_human_events(n: usize) -> Vec<StrikeEvent> {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let actions = [
            ActionType::BrushStroke,
            ActionType::BrushStroke,
            ActionType::ToolChange,
            ActionType::BrushStroke,
            ActionType::UndoRedo,
            ActionType::Selection,
            ActionType::BrushStroke,
            ActionType::LayerOperation,
        ];

        let mut events = Vec::with_capacity(n);
        let mut t = 1000u64;

        for i in 0..n {
            let mut hasher = DefaultHasher::new();
            i.hash(&mut hasher);
            let hash = hasher.finish();

            // Variable timing (50-500ms gaps) simulating human behavior
            let gap = 50 + (hash % 450);
            t += gap;

            let pressure = 0.3 + (((hash >> 8) % 400) as f32) / 1000.0;
            let velocity = 50.0 + (((hash >> 16) % 200) as f32);

            events.push(StrikeEvent {
                session_id: "human-session".into(),
                sequence_id: i as u64,
                action: actions[i % actions.len()],
                telemetry: Telemetry {
                    pressure: Some(pressure),
                    velocity: Some(velocity),
                    duration_ms: 10 + ((hash >> 24) % 50) as u32,
                    tool_id: "brush".into(),
                    coordinates: Some((i as f64 * 1.5, i as f64 * 0.8)),
                    input_entropy: 0.7 + ((hash >> 32) % 30) as f32 / 100.0,
                },
                timestamp_ms: t,
            });
        }
        events
    }

    fn make_bot_events(n: usize) -> Vec<StrikeEvent> {
        let mut events = Vec::with_capacity(n);
        let mut t = 1000u64;

        for i in 0..n {
            // Perfectly regular timing (exactly 100ms apart)
            t += 100;

            events.push(StrikeEvent {
                session_id: "bot-session".into(),
                sequence_id: i as u64,
                action: ActionType::BrushStroke, // always the same action
                telemetry: Telemetry {
                    pressure: Some(0.5),   // constant pressure
                    velocity: Some(100.0), // constant velocity
                    duration_ms: 16,
                    tool_id: "brush".into(),
                    coordinates: Some((i as f64, i as f64)),
                    input_entropy: 0.1,
                },
                timestamp_ms: t,
            });
        }
        events
    }

    #[test]
    fn insufficient_data_error() {
        let analyzer = RuleBasedAnalyzer::new();
        let events = make_human_events(5);
        let result = analyzer.analyze(&events);
        assert!(matches!(result, Err(ArmorerError::InsufficientData { .. })));
    }

    #[test]
    fn human_events_score_high() {
        let analyzer = RuleBasedAnalyzer::new();
        let events = make_human_events(200);
        let report = analyzer.analyze(&events).unwrap();

        assert!(report.score > 0.70, "human score {} should be > 0.70", report.score);
        assert!(
            !matches!(report.grade, PurityGrade::Synthetic),
            "human grade should not be Synthetic, got {:?} (score: {})",
            report.grade, report.score
        );
    }

    #[test]
    fn bot_events_score_low() {
        let analyzer = RuleBasedAnalyzer::new();
        let events = make_bot_events(200);
        let report = analyzer.analyze(&events).unwrap();

        assert!(report.score < 0.5, "bot score {} should be < 0.5", report.score);
        assert!(
            matches!(report.grade, PurityGrade::Synthetic | PurityGrade::Assisted),
            "bot grade should be Synthetic or Assisted, got {:?}",
            report.grade
        );
    }

    #[test]
    fn confidence_scales_with_sample_size() {
        let analyzer = RuleBasedAnalyzer::new();

        let small = analyzer.analyze(&make_human_events(50)).unwrap();
        let large = analyzer.analyze(&make_human_events(500)).unwrap();

        assert!(large.confidence > small.confidence);
        assert!((large.confidence - 1.0).abs() < 0.01);
    }

    #[test]
    fn feature_scores_are_bounded() {
        let analyzer = RuleBasedAnalyzer::new();
        let report = analyzer.analyze(&make_human_events(100)).unwrap();

        let f = &report.features;
        assert!((0.0..=1.0).contains(&f.shannon_entropy));
        assert!((0.0..=1.0).contains(&f.hurst_exponent));
        assert!((0.0..=1.0).contains(&f.timing_jitter));
        assert!((0.0..=1.0).contains(&f.pressure_variance));
        assert!((0.0..=1.0).contains(&f.velocity_autocorrelation));
        assert!((0.0..=1.0).contains(&f.action_transition_entropy));
        assert!((0.0..=1.0).contains(&f.pause_distribution_fit));
        assert!((0.0..=1.0).contains(&f.burst_density_variance));
    }

    #[test]
    fn human_scores_higher_than_bot() {
        let analyzer = RuleBasedAnalyzer::new();
        let human = analyzer.analyze(&make_human_events(200)).unwrap();
        let bot = analyzer.analyze(&make_bot_events(200)).unwrap();

        assert!(
            human.score > bot.score + 0.2,
            "human ({:.3}) should be well above bot ({:.3})",
            human.score, bot.score
        );
    }

    #[test]
    fn grade_thresholds() {
        assert_eq!(PurityGrade::from_score(0.98), PurityGrade::Masterwork);
        assert_eq!(PurityGrade::from_score(0.85), PurityGrade::HandForged);
        assert_eq!(PurityGrade::from_score(0.65), PurityGrade::Assisted);
        assert_eq!(PurityGrade::from_score(0.30), PurityGrade::Synthetic);
    }
}
