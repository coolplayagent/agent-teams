use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{command::CommandResult, log_scan::LogFinding, pressure::PressureReport};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GateObservation {
    pub name: String,
    pub passed: bool,
    pub duration_ms: u64,
    pub message: String,
}

impl GateObservation {
    pub fn from_command(result: &CommandResult) -> Self {
        Self {
            name: result.name.clone(),
            passed: result.passed(),
            duration_ms: result.duration_ms,
            message: result.gate_message(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricObservation {
    pub name: String,
    pub value: f64,
    pub budget: f64,
    pub lower_is_better: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvaluationObservation {
    pub generated_diff: bool,
    pub gates: Vec<GateObservation>,
    pub metrics: Vec<MetricObservation>,
    pub log_findings: Vec<LogFinding>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreBreakdown {
    pub score: f64,
    pub stability: f64,
    pub latency: f64,
    pub throughput: f64,
    pub log_quality: f64,
    pub test_quality: f64,
    pub accepted: bool,
    pub reject_reasons: Vec<String>,
    pub improvements: Vec<Value>,
    pub degradations: Vec<Value>,
}

#[derive(Debug, Clone)]
pub struct EvaluationRun {
    pub observation: EvaluationObservation,
    pub report: Value,
}

impl EvaluationRun {
    pub fn empty(generated_diff: bool) -> Self {
        Self {
            observation: EvaluationObservation {
                generated_diff,
                gates: Vec::new(),
                metrics: Vec::new(),
                log_findings: Vec::new(),
            },
            report: serde_json::json!({"generated_diff": generated_diff}),
        }
    }

    pub fn from_failed_gate(
        name: &str,
        generated_diff: bool,
        duration_ms: u64,
        message: String,
    ) -> Self {
        Self {
            observation: EvaluationObservation {
                generated_diff,
                gates: vec![GateObservation {
                    name: name.to_owned(),
                    passed: false,
                    duration_ms,
                    message,
                }],
                metrics: Vec::new(),
                log_findings: Vec::new(),
            },
            report: serde_json::json!({"generated_diff": generated_diff}),
        }
    }
}

impl EvaluationObservation {
    pub fn from_parts(
        generated_diff: bool,
        gates: Vec<GateObservation>,
        pressure: PressureReport,
        log_findings: Vec<LogFinding>,
    ) -> Self {
        let success_ratio = if pressure.total_requests == 0 {
            1.0
        } else {
            pressure.success_count as f64 / pressure.total_requests as f64
        };
        let terminal_ratio = if pressure.run_count == 0 {
            1.0
        } else {
            pressure.terminal_run_count as f64 / pressure.run_count as f64
        };
        let metrics = vec![
            MetricObservation {
                name: "pressure_success_ratio".to_owned(),
                value: success_ratio,
                budget: 0.995,
                lower_is_better: false,
            },
            MetricObservation {
                name: "terminal_run_ratio".to_owned(),
                value: terminal_ratio,
                budget: 1.0,
                lower_is_better: false,
            },
            MetricObservation {
                name: "failed_terminal_run_count".to_owned(),
                value: pressure.failed_terminal_run_count as f64,
                budget: 0.0,
                lower_is_better: true,
            },
            MetricObservation {
                name: "busy_count".to_owned(),
                value: pressure.busy_count as f64,
                budget: 0.0,
                lower_is_better: true,
            },
            MetricObservation {
                name: "overloaded_response_count".to_owned(),
                value: pressure.overloaded_response_count as f64,
                budget: 0.0,
                lower_is_better: true,
            },
            MetricObservation {
                name: "cleanup_failure_count".to_owned(),
                value: pressure.cleanup_failure_count as f64,
                budget: 0.0,
                lower_is_better: true,
            },
            MetricObservation {
                name: "latency_p95_ms".to_owned(),
                value: pressure.latency_p95_ms as f64,
                budget: 6_000.0,
                lower_is_better: true,
            },
            MetricObservation {
                name: "live_p95_ms".to_owned(),
                value: pressure.live_p95_ms as f64,
                budget: 2_000.0,
                lower_is_better: true,
            },
            MetricObservation {
                name: "total_requests".to_owned(),
                value: pressure.total_requests as f64,
                budget: 1.0,
                lower_is_better: false,
            },
        ];
        Self {
            generated_diff,
            gates,
            metrics,
            log_findings,
        }
    }
}

pub fn score_evaluation(
    observation: &EvaluationObservation,
    previous: Option<&Value>,
) -> ScoreBreakdown {
    let stability = stability_score(observation);
    let latency = latency_score(observation);
    let throughput = throughput_score(observation);
    let log_quality = log_quality_score(&observation.log_findings);
    let test_quality = test_quality_score(observation);
    let score = clamp(
        stability * 0.35
            + latency * 0.20
            + throughput * 0.15
            + log_quality * 0.20
            + test_quality * 0.10,
    );
    let reject_reasons = reject_reasons(
        observation,
        ScoreComponents {
            score,
            stability,
            log_quality,
        },
        previous,
    );
    let improvements = changes(previous, score, true);
    let degradations = changes(previous, score, false);
    ScoreBreakdown {
        score,
        stability,
        latency,
        throughput,
        log_quality,
        test_quality,
        accepted: reject_reasons.is_empty(),
        reject_reasons,
        improvements,
        degradations,
    }
}

#[derive(Debug, Clone, Copy)]
struct ScoreComponents {
    score: f64,
    stability: f64,
    log_quality: f64,
}

fn reject_reasons(
    observation: &EvaluationObservation,
    current: ScoreComponents,
    previous: Option<&Value>,
) -> Vec<String> {
    let mut reasons = Vec::new();
    if !observation.generated_diff {
        reasons.push("candidate has no diff".to_owned());
    }
    let failed_gates = observation
        .gates
        .iter()
        .filter(|gate| !gate.passed)
        .map(|gate| gate.name.clone())
        .collect::<Vec<_>>();
    if !failed_gates.is_empty() {
        reasons.push(format!("quality gates failed: {}", failed_gates.join(", ")));
    }
    for metric in &observation.metrics {
        if metric.name == "busy_count" && metric.value > 0.0 {
            reasons.push("pressure returned Server is busy".to_owned());
        }
        if metric.name == "overloaded_response_count" && metric.value > 0.0 {
            reasons.push("pressure returned 429, 503, or 5xx".to_owned());
        }
        if metric.name == "terminal_run_ratio" && metric.value < 1.0 {
            reasons.push("one or more SSE streams missed terminal event".to_owned());
        }
        if metric.name == "failed_terminal_run_count" && metric.value > 0.0 {
            reasons.push("one or more pressure probe runs failed or stopped".to_owned());
        }
        if metric.name == "cleanup_failure_count" && metric.value > 0.0 {
            reasons.push("pressure cleanup failed".to_owned());
        }
        if metric.name == "pressure_success_ratio" && metric.value < metric.budget {
            reasons.push(format!(
                "pressure success ratio below budget: {:.4} < {:.4}",
                metric.value, metric.budget
            ));
        }
        if matches!(metric.name.as_str(), "latency_p95_ms" | "live_p95_ms")
            && metric.value > metric.budget
        {
            reasons.push(format!(
                "{} above budget: {:.0} > {:.0}",
                metric.name, metric.value, metric.budget
            ));
        }
    }
    if observation
        .log_findings
        .iter()
        .any(|finding| finding.severity == "ERROR")
    {
        reasons.push("pressure window has ERROR logs".to_owned());
    }
    if let Some(previous) = previous {
        for (name, current_value) in [
            ("stability", current.stability),
            ("log_quality", current.log_quality),
        ] {
            let previous_value = previous.get(name).and_then(Value::as_f64).unwrap_or(0.0);
            if current_value + 0.005 < previous_value {
                reasons.push(format!(
                    "protected {name} regressed: {:.6} < {:.6}",
                    current_value, previous_value
                ));
            }
        }
        let previous_score = previous.get("score").and_then(Value::as_f64).unwrap_or(0.0);
        if current.score <= previous_score + 0.0005 && reasons.is_empty() {
            reasons.push(format!(
                "score did not improve beyond epsilon: {:.6} <= {:.6}",
                current.score, previous_score
            ));
        }
    }
    reasons
}

fn stability_score(observation: &EvaluationObservation) -> f64 {
    if observation.gates.iter().any(|gate| !gate.passed) {
        return 0.0;
    }
    let success_ratio = metric(observation, "pressure_success_ratio").unwrap_or(1.0);
    let terminal_ratio = metric(observation, "terminal_run_ratio").unwrap_or(1.0);
    let busy_count = metric(observation, "busy_count").unwrap_or(0.0);
    let overloaded_count = metric(observation, "overloaded_response_count").unwrap_or(0.0);
    let cleanup_failure_count = metric(observation, "cleanup_failure_count").unwrap_or(0.0);
    let failed_terminal_run_count = metric(observation, "failed_terminal_run_count").unwrap_or(0.0);
    if busy_count > 0.0
        || overloaded_count > 0.0
        || cleanup_failure_count > 0.0
        || failed_terminal_run_count > 0.0
    {
        return 0.0;
    }
    clamp((success_ratio + terminal_ratio) / 2.0)
}

fn latency_score(observation: &EvaluationObservation) -> f64 {
    let latency_p95 = metric(observation, "latency_p95_ms").unwrap_or(0.0);
    let live_p95 = metric(observation, "live_p95_ms").unwrap_or(0.0);
    let request_score = if latency_p95 <= 0.0 {
        1.0
    } else {
        (6_000.0 / latency_p95.max(1.0)).min(1.0)
    };
    let live_score = if live_p95 <= 0.0 {
        1.0
    } else {
        (2_000.0 / live_p95.max(1.0)).min(1.0)
    };
    clamp((request_score + live_score) / 2.0)
}

fn throughput_score(observation: &EvaluationObservation) -> f64 {
    let total = metric(observation, "total_requests").unwrap_or(0.0);
    if total <= 0.0 {
        1.0
    } else {
        (total / 1_000.0).min(1.0)
    }
}

fn log_quality_score(findings: &[LogFinding]) -> f64 {
    let errors: usize = findings
        .iter()
        .filter(|finding| finding.severity == "ERROR")
        .map(|finding| finding.count)
        .sum();
    let warnings: usize = findings
        .iter()
        .filter(|finding| finding.severity == "WARNING")
        .map(|finding| finding.count)
        .sum();
    if errors > 0 {
        return 0.0;
    }
    (1.0 - (warnings as f64 * 0.02)).max(0.0)
}

fn test_quality_score(observation: &EvaluationObservation) -> f64 {
    if observation.gates.is_empty() {
        return 0.0;
    }
    let passed = observation.gates.iter().filter(|gate| gate.passed).count();
    passed as f64 / observation.gates.len() as f64
}

fn changes(previous: Option<&Value>, score: f64, improvement: bool) -> Vec<Value> {
    let Some(previous) = previous else {
        return Vec::new();
    };
    let previous_score = previous.get("score").and_then(Value::as_f64).unwrap_or(0.0);
    let delta = score - previous_score;
    if (improvement && delta > 0.0005) || (!improvement && delta < -0.0005) {
        vec![serde_json::json!({
            "name": "score",
            "previous": previous_score,
            "current": score,
            "delta": delta,
        })]
    } else {
        Vec::new()
    }
}

fn metric(observation: &EvaluationObservation, name: &str) -> Option<f64> {
    observation
        .metrics
        .iter()
        .find(|metric| metric.name == name)
        .map(|metric| metric.value)
}

fn clamp(value: f64) -> f64 {
    value.clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_logs_reject_candidate() {
        let observation = EvaluationObservation {
            generated_diff: true,
            gates: Vec::new(),
            metrics: Vec::new(),
            log_findings: vec![LogFinding {
                severity: "ERROR".to_owned(),
                signature: "boom".to_owned(),
                count: 1,
                sample: "ERROR boom".to_owned(),
            }],
        };
        let score = score_evaluation(&observation, None);
        assert!(!score.accepted);
        assert!(
            score
                .reject_reasons
                .iter()
                .any(|reason| reason.contains("ERROR"))
        );
    }

    #[test]
    fn overloaded_responses_reject_candidate() {
        let observation = EvaluationObservation {
            generated_diff: true,
            gates: Vec::new(),
            metrics: vec![MetricObservation {
                name: "overloaded_response_count".to_owned(),
                value: 1.0,
                budget: 0.0,
                lower_is_better: true,
            }],
            log_findings: Vec::new(),
        };
        let score = score_evaluation(&observation, None);
        assert!(!score.accepted);
        assert!(
            score
                .reject_reasons
                .iter()
                .any(|reason| reason.contains("429"))
        );
    }

    #[test]
    fn latency_budget_violations_reject_candidate() {
        let observation = EvaluationObservation {
            generated_diff: true,
            gates: Vec::new(),
            metrics: vec![
                MetricObservation {
                    name: "latency_p95_ms".to_owned(),
                    value: 6_500.0,
                    budget: 6_000.0,
                    lower_is_better: true,
                },
                MetricObservation {
                    name: "live_p95_ms".to_owned(),
                    value: 2_500.0,
                    budget: 2_000.0,
                    lower_is_better: true,
                },
            ],
            log_findings: Vec::new(),
        };

        let score = score_evaluation(&observation, None);

        assert!(!score.accepted);
        assert!(
            score
                .reject_reasons
                .iter()
                .any(|reason| reason.contains("latency_p95_ms above budget"))
        );
        assert!(
            score
                .reject_reasons
                .iter()
                .any(|reason| reason.contains("live_p95_ms above budget"))
        );
    }

    #[test]
    fn cleanup_failures_reject_candidate() {
        let observation = EvaluationObservation {
            generated_diff: true,
            gates: Vec::new(),
            metrics: vec![MetricObservation {
                name: "cleanup_failure_count".to_owned(),
                value: 1.0,
                budget: 0.0,
                lower_is_better: true,
            }],
            log_findings: Vec::new(),
        };

        let score = score_evaluation(&observation, None);

        assert!(!score.accepted);
        assert!(
            score
                .reject_reasons
                .iter()
                .any(|reason| reason.contains("cleanup failed"))
        );
    }

    #[test]
    fn failed_terminal_runs_reject_candidate() {
        let observation = EvaluationObservation {
            generated_diff: true,
            gates: Vec::new(),
            metrics: vec![MetricObservation {
                name: "failed_terminal_run_count".to_owned(),
                value: 1.0,
                budget: 0.0,
                lower_is_better: true,
            }],
            log_findings: Vec::new(),
        };

        let score = score_evaluation(&observation, None);

        assert!(!score.accepted);
        assert!(
            score
                .reject_reasons
                .iter()
                .any(|reason| reason.contains("failed or stopped"))
        );
    }
}
