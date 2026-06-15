use std::fs;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    command::CommandResult,
    git_ops::PatchSnapshot,
    scoring::{EvaluationObservation, ScoreBreakdown},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AlgorithmArchitectureImprovement {
    pub area: String,
    pub improvement: String,
    pub evidence: String,
}

pub fn candidate_algorithm_architecture_improvements(
    patch: &PatchSnapshot,
    codex_result: Option<&CommandResult>,
    score: &ScoreBreakdown,
    observation: &EvaluationObservation,
) -> Vec<AlgorithmArchitectureImprovement> {
    if !patch.has_diff {
        return Vec::new();
    }
    let changed_paths = changed_paths_from_patch(patch);
    let extracted = codex_result
        .into_iter()
        .flat_map(extract_algorithm_architecture_lines)
        .collect::<Vec<_>>();
    if !extracted.is_empty() {
        return extracted
            .into_iter()
            .take(8)
            .map(|line| AlgorithmArchitectureImprovement {
                area: infer_area(&changed_paths),
                improvement: line,
                evidence: "codex final notes".to_owned(),
            })
            .collect();
    }
    vec![AlgorithmArchitectureImprovement {
        area: infer_area(&changed_paths),
        improvement: fallback_improvement_summary(score, observation),
        evidence: fallback_evidence(patch, &changed_paths),
    }]
}

pub fn report_with_algorithm_architecture_improvements(
    report: &Value,
    improvements: &[AlgorithmArchitectureImprovement],
) -> Result<Value, String> {
    let mut value = report.clone();
    value["algorithm_architecture_improvements"] =
        serde_json::to_value(improvements).map_err(|error| error.to_string())?;
    Ok(value)
}

pub fn changed_paths_from_patch(patch: &PatchSnapshot) -> Vec<String> {
    fs::read_to_string(&patch.path)
        .map(|diff| changed_paths_from_diff(&diff))
        .unwrap_or_default()
}

fn extract_algorithm_architecture_lines(result: &CommandResult) -> Vec<String> {
    let combined = format!("{}\n{}", result.stdout, result.stderr);
    let mut lines = Vec::new();
    let mut collecting = false;
    let mut collected_any = false;
    for raw_line in combined.lines() {
        let line = raw_line.trim();
        if is_algorithm_architecture_heading(line) {
            collecting = true;
            collected_any = false;
            continue;
        }
        if !collecting {
            continue;
        }
        if line.is_empty() {
            if collected_any {
                break;
            }
            continue;
        }
        if collected_any && line.starts_with('#') {
            break;
        }
        if collected_any && line.ends_with(':') && !line.contains(' ') {
            break;
        }
        let cleaned = clean_bullet(line);
        if !cleaned.is_empty() {
            lines.push(cleaned);
            collected_any = true;
        }
    }
    lines
}

fn is_algorithm_architecture_heading(line: &str) -> bool {
    let normalized = line.trim_matches(['#', '*', ':', ' ']).to_ascii_lowercase();
    normalized.contains("algorithm")
        && normalized.contains("architecture")
        && normalized.contains("improvement")
}

fn clean_bullet(line: &str) -> String {
    line.trim_start_matches(['-', '*', ' '])
        .trim_start_matches(|character: char| character.is_ascii_digit() || character == '.')
        .trim()
        .chars()
        .take(500)
        .collect()
}

fn changed_paths_from_diff(diff: &str) -> Vec<String> {
    let mut paths = Vec::new();
    for line in diff.lines() {
        let Some(rest) = line.strip_prefix("diff --git ") else {
            continue;
        };
        let parts = rest.split_whitespace().collect::<Vec<_>>();
        let Some(path) = parts.get(1).and_then(|value| value.strip_prefix("b/")) else {
            continue;
        };
        if path != "/dev/null" && !paths.iter().any(|existing| existing == path) {
            paths.push(path.to_owned());
        }
    }
    paths
}

fn infer_area(changed_paths: &[String]) -> String {
    if changed_paths.is_empty() {
        return "unknown".to_owned();
    }
    let mut prefixes = changed_paths
        .iter()
        .filter_map(|path| path.split('/').next())
        .filter(|prefix| !prefix.is_empty())
        .collect::<Vec<_>>();
    prefixes.sort_unstable();
    prefixes.dedup();
    if prefixes.len() == 1 {
        prefixes[0].to_owned()
    } else {
        prefixes.into_iter().take(3).collect::<Vec<_>>().join(",")
    }
}

fn fallback_improvement_summary(
    score: &ScoreBreakdown,
    observation: &EvaluationObservation,
) -> String {
    if score.accepted {
        return format!(
            "Accepted candidate changes the affected subsystem architecture or algorithm surface with score {:.6}.",
            score.score
        );
    }
    let failed_gates = observation
        .gates
        .iter()
        .filter(|gate| !gate.passed)
        .map(|gate| gate.name.as_str())
        .collect::<Vec<_>>();
    if !failed_gates.is_empty() {
        return format!(
            "Rejected candidate still records its attempted architecture or algorithm change; failed gates: {}.",
            failed_gates.join(", ")
        );
    }
    format!(
        "Candidate records its attempted architecture or algorithm change for follow-up; score {:.6}.",
        score.score
    )
}

fn fallback_evidence(patch: &PatchSnapshot, changed_paths: &[String]) -> String {
    let paths = if changed_paths.is_empty() {
        "none parsed".to_owned()
    } else {
        changed_paths
            .iter()
            .take(8)
            .cloned()
            .collect::<Vec<_>>()
            .join(", ")
    };
    format!(
        "patch_sha256={} patch_bytes={} changed_paths={}",
        patch.sha256, patch.bytes, paths
    )
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    #[test]
    fn extracts_algorithm_architecture_section_from_codex_output() {
        let result = CommandResult {
            name: "codex_generation".to_owned(),
            command: Vec::new(),
            exit_code: 0,
            duration_ms: 1,
            stdout: "Algorithm architecture improvements:\n- Split queue admission from SSE streaming backpressure.\n- Added bounded cleanup ownership.\n\nOther notes\n".to_owned(),
            stderr: String::new(),
        };

        let lines = extract_algorithm_architecture_lines(&result);

        assert_eq!(
            lines,
            vec![
                "Split queue admission from SSE streaming backpressure.",
                "Added bounded cleanup ownership."
            ]
        );
    }

    #[test]
    fn falls_back_to_patch_summary_when_codex_output_has_no_notes() {
        let root = std::env::temp_dir().join(format!(
            "relay-teams-architecture-notes-{}",
            std::process::id()
        ));
        fs::create_dir_all(&root).unwrap();
        let patch_path = root.join("candidate.patch");
        fs::write(
            &patch_path,
            "diff --git a/src/service.py b/src/service.py\n--- a/src/service.py\n+++ b/src/service.py\n",
        )
        .unwrap();
        let patch = PatchSnapshot {
            path: patch_path,
            has_diff: true,
            sha256: "abc".to_owned(),
            bytes: 12,
        };
        let score = ScoreBreakdown {
            score: 0.8,
            stability: 1.0,
            latency: 0.5,
            throughput: 1.0,
            log_quality: 1.0,
            test_quality: 1.0,
            accepted: true,
            reject_reasons: Vec::new(),
            improvements: Vec::new(),
            degradations: Vec::new(),
        };
        let observation = EvaluationObservation {
            generated_diff: true,
            gates: Vec::new(),
            metrics: Vec::new(),
            log_findings: Vec::new(),
        };

        let improvements =
            candidate_algorithm_architecture_improvements(&patch, None, &score, &observation);
        let _ = fs::remove_dir_all(root);

        assert_eq!(improvements.len(), 1);
        assert_eq!(improvements[0].area, "src");
        assert!(improvements[0].evidence.contains("src/service.py"));
    }

    #[test]
    fn empty_patch_has_no_algorithm_architecture_improvements() {
        let patch = PatchSnapshot {
            path: PathBuf::from("missing.patch"),
            has_diff: false,
            sha256: String::new(),
            bytes: 0,
        };
        let score = ScoreBreakdown {
            score: 0.0,
            stability: 0.0,
            latency: 0.0,
            throughput: 0.0,
            log_quality: 0.0,
            test_quality: 0.0,
            accepted: false,
            reject_reasons: Vec::new(),
            improvements: Vec::new(),
            degradations: Vec::new(),
        };
        let observation = EvaluationObservation {
            generated_diff: false,
            gates: Vec::new(),
            metrics: Vec::new(),
            log_findings: Vec::new(),
        };

        let improvements =
            candidate_algorithm_architecture_improvements(&patch, None, &score, &observation);

        assert!(improvements.is_empty());
    }
}
