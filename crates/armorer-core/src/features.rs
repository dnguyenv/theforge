use std::collections::HashMap;

use anvil_event_bus::StrikeEvent;

pub fn shannon_entropy(events: &[StrikeEvent]) -> f64 {
    let mut counts: HashMap<u8, usize> = HashMap::new();
    for e in events {
        let key = e.action as u8;
        *counts.entry(key).or_default() += 1;
    }

    let n = events.len() as f64;
    let mut entropy = 0.0;
    for &count in counts.values() {
        let p = count as f64 / n;
        if p > 0.0 {
            entropy -= p * p.log2();
        }
    }

    let max_entropy = (counts.len() as f64).log2().max(1.0);
    (entropy / max_entropy).clamp(0.0, 1.0)
}

pub fn hurst_exponent(events: &[StrikeEvent]) -> f64 {
    let intervals: Vec<f64> = events
        .windows(2)
        .map(|w| (w[1].timestamp_ms as f64) - (w[0].timestamp_ms as f64))
        .collect();

    if intervals.len() < 20 {
        return 0.5;
    }

    rescaled_range_hurst(&intervals)
}

fn rescaled_range_hurst(series: &[f64]) -> f64 {
    let n = series.len();
    let mut log_rs = Vec::new();
    let mut log_n = Vec::new();

    let sizes: Vec<usize> = [8, 16, 32, 64, 128, 256, 512]
        .iter()
        .copied()
        .filter(|&s| s <= n)
        .collect();

    if sizes.len() < 2 {
        return 0.5;
    }

    for &size in &sizes {
        let mut rs_values = Vec::new();
        let chunks = n / size;

        for i in 0..chunks {
            let chunk = &series[i * size..(i + 1) * size];
            let mean = chunk.iter().sum::<f64>() / size as f64;
            let std_dev = (chunk.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / size as f64).sqrt();

            if std_dev < 1e-10 {
                continue;
            }

            let mut cumulative = Vec::with_capacity(size);
            let mut running = 0.0;
            for &val in chunk {
                running += val - mean;
                cumulative.push(running);
            }

            let range = cumulative.iter().cloned().fold(f64::NEG_INFINITY, f64::max)
                - cumulative.iter().cloned().fold(f64::INFINITY, f64::min);

            rs_values.push(range / std_dev);
        }

        if !rs_values.is_empty() {
            let avg_rs = rs_values.iter().sum::<f64>() / rs_values.len() as f64;
            log_rs.push(avg_rs.ln());
            log_n.push((size as f64).ln());
        }
    }

    if log_rs.len() < 2 {
        return 0.5;
    }

    linear_regression_slope(&log_n, &log_rs).clamp(0.0, 1.0)
}

fn linear_regression_slope(x: &[f64], y: &[f64]) -> f64 {
    let n = x.len() as f64;
    let sum_x: f64 = x.iter().sum();
    let sum_y: f64 = y.iter().sum();
    let sum_xy: f64 = x.iter().zip(y.iter()).map(|(a, b)| a * b).sum();
    let sum_x2: f64 = x.iter().map(|a| a * a).sum();

    let denom = n * sum_x2 - sum_x * sum_x;
    if denom.abs() < 1e-10 {
        return 0.5;
    }

    (n * sum_xy - sum_x * sum_y) / denom
}

pub fn timing_jitter(events: &[StrikeEvent]) -> f64 {
    let intervals: Vec<f64> = events
        .windows(2)
        .map(|w| (w[1].timestamp_ms as f64) - (w[0].timestamp_ms as f64))
        .collect();

    if intervals.is_empty() {
        return 0.0;
    }

    let mean = intervals.iter().sum::<f64>() / intervals.len() as f64;
    if mean < 1e-10 {
        return 0.0;
    }

    let std_dev = (intervals.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / intervals.len() as f64).sqrt();
    let cv = std_dev / mean;

    // High CV = human (variable timing), low CV = bot (precise timing)
    // Normalize: CV > 0.5 is very human, < 0.05 is very bot
    (cv / 0.5).clamp(0.0, 1.0)
}

pub fn pressure_variance(events: &[StrikeEvent]) -> f64 {
    let pressures: Vec<f64> = events
        .iter()
        .filter_map(|e| e.telemetry.pressure)
        .map(|p| p as f64)
        .collect();

    if pressures.len() < 2 {
        return 0.5;
    }

    let mean = pressures.iter().sum::<f64>() / pressures.len() as f64;
    let variance = pressures.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / pressures.len() as f64;
    let std_dev = variance.sqrt();

    // Human pressure typically has std_dev 0.1-0.3, bot has ~0
    (std_dev / 0.2).clamp(0.0, 1.0)
}

pub fn velocity_autocorrelation(events: &[StrikeEvent]) -> f64 {
    let velocities: Vec<f64> = events
        .iter()
        .filter_map(|e| e.telemetry.velocity)
        .map(|v| v as f64)
        .collect();

    if velocities.len() < 10 {
        return 0.5;
    }

    let mean = velocities.iter().sum::<f64>() / velocities.len() as f64;
    let n = velocities.len();

    let mut numerator = 0.0;
    let mut denominator = 0.0;

    for i in 0..n - 1 {
        numerator += (velocities[i] - mean) * (velocities[i + 1] - mean);
    }
    for v in &velocities {
        denominator += (v - mean).powi(2);
    }

    if denominator.abs() < 1e-10 {
        return 0.5;
    }

    let autocorr = (numerator / denominator).abs();

    // Low autocorrelation = human (unpredictable), high = bot (smooth/linear)
    // Invert: score 1.0 = human, 0.0 = bot
    (1.0 - autocorr).clamp(0.0, 1.0)
}

pub fn action_transition_entropy(events: &[StrikeEvent]) -> f64 {
    if events.len() < 2 {
        return 0.5;
    }

    let mut transitions: HashMap<(u8, u8), usize> = HashMap::new();
    for pair in events.windows(2) {
        let from = pair[0].action as u8;
        let to = pair[1].action as u8;
        *transitions.entry((from, to)).or_default() += 1;
    }

    let total = (events.len() - 1) as f64;
    let mut entropy = 0.0;
    for &count in transitions.values() {
        let p = count as f64 / total;
        if p > 0.0 {
            entropy -= p * p.log2();
        }
    }

    let max_possible = (transitions.len() as f64).log2().max(1.0);
    (entropy / max_possible).clamp(0.0, 1.0)
}

pub fn pause_distribution_fit(events: &[StrikeEvent]) -> f64 {
    let intervals: Vec<f64> = events
        .windows(2)
        .map(|w| (w[1].timestamp_ms as f64) - (w[0].timestamp_ms as f64))
        .filter(|&d| d > 0.0)
        .collect();

    if intervals.len() < 10 {
        return 0.5;
    }

    // Human pauses follow log-normal distribution
    // Test: compute skewness of log(intervals) — should be near 0 for log-normal
    let log_intervals: Vec<f64> = intervals.iter().map(|x| x.ln()).collect();
    let mean = log_intervals.iter().sum::<f64>() / log_intervals.len() as f64;
    let n = log_intervals.len() as f64;

    let variance = log_intervals.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / n;
    let std_dev = variance.sqrt();

    if std_dev < 1e-10 {
        return 0.0; // Zero variance in log-space = perfectly uniform = bot
    }

    let skewness = log_intervals.iter().map(|x| ((x - mean) / std_dev).powi(3)).sum::<f64>() / n;

    // Skewness near 0 = log-normal (human), large |skewness| = not log-normal
    let fit = 1.0 - (skewness.abs() / 2.0);
    fit.clamp(0.0, 1.0)
}

pub fn burst_density_variance(events: &[StrikeEvent]) -> f64 {
    if events.len() < 20 {
        return 0.5;
    }

    // Divide timeline into 1-second windows, count events per window
    let start = events[0].timestamp_ms;
    let end = events.last().unwrap().timestamp_ms;
    let duration_s = ((end - start) as f64 / 1000.0).max(1.0);
    let num_windows = (duration_s as usize).max(1);

    let mut buckets = vec![0u32; num_windows];
    for e in events {
        let offset = ((e.timestamp_ms - start) as f64 / 1000.0) as usize;
        let bucket = offset.min(num_windows - 1);
        buckets[bucket] += 1;
    }

    let non_zero: Vec<f64> = buckets.iter().filter(|&&b| b > 0).map(|&b| b as f64).collect();
    if non_zero.len() < 2 {
        return 0.5;
    }

    let mean = non_zero.iter().sum::<f64>() / non_zero.len() as f64;
    let cv = if mean > 0.0 {
        let std_dev = (non_zero.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / non_zero.len() as f64).sqrt();
        std_dev / mean
    } else {
        0.0
    };

    // High CV = variable burst density (human), low CV = constant rate (bot)
    (cv / 1.0).clamp(0.0, 1.0)
}
