use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

use serde_json::Value;

use crate::{
    architecture_notes::AlgorithmArchitectureImprovement,
    git_ops::PatchSnapshot,
    scoring::{EvaluationObservation, ScoreBreakdown},
};

#[derive(Debug, Clone)]
pub struct HistoryPaths {
    pub root: PathBuf,
    pub patches: PathBuf,
    pub reports: PathBuf,
    pub memory: PathBuf,
    pub runs_jsonl: PathBuf,
    pub score_csv: PathBuf,
    pub algorithm_architecture_markdown: PathBuf,
}

impl HistoryPaths {
    pub fn new(workspace: &Path) -> Result<Self, String> {
        let output = Command::new("git")
            .args([
                "rev-parse",
                "--git-path",
                "relay-teams-performance-iteration",
            ])
            .current_dir(workspace)
            .output()
            .map_err(|error| format!("failed to resolve git history path: {error}"))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
        }
        let git_path = PathBuf::from(String::from_utf8_lossy(&output.stdout).trim());
        let root = if git_path.is_absolute() {
            git_path
        } else {
            workspace.join(git_path)
        };
        Ok(Self {
            patches: root.join("patches"),
            reports: root.join("reports"),
            memory: root.join("memory"),
            runs_jsonl: root.join("runs.jsonl"),
            score_csv: root.join("score.csv"),
            algorithm_architecture_markdown: root.join("algorithm-architecture-improvements.md"),
            root,
        })
    }

    pub fn ensure(&self) -> Result<(), String> {
        for path in [&self.root, &self.patches, &self.reports, &self.memory] {
            fs::create_dir_all(path)
                .map_err(|error| format!("failed to create {}: {error}", path.display()))?;
        }
        Ok(())
    }
}

pub struct RunRecordInput<'a> {
    pub run_id: &'a str,
    pub profile: &'a str,
    pub mode: &'a str,
    pub patch: &'a PatchSnapshot,
    pub report_path: &'a Path,
    pub score: &'a ScoreBreakdown,
    pub observation: &'a EvaluationObservation,
    pub algorithm_architecture_improvements: &'a [AlgorithmArchitectureImprovement],
    pub commit: Option<&'a str>,
}

pub fn new_run_id(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("{prefix}-{nanos}")
}

pub fn write_report(paths: &HistoryPaths, run_id: &str, report: &Value) -> Result<PathBuf, String> {
    paths.ensure()?;
    let path = paths.reports.join(format!("{run_id}.json"));
    fs::write(
        &path,
        serde_json::to_string_pretty(report).map_err(|error| error.to_string())? + "\n",
    )
    .map_err(|error| format!("failed to write {}: {error}", path.display()))?;
    Ok(path)
}

pub fn append_run(paths: &HistoryPaths, record: &Value) -> Result<(), String> {
    paths.ensure()?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&paths.runs_jsonl)
        .map_err(|error| format!("failed to open {}: {error}", paths.runs_jsonl.display()))?;
    writeln!(
        file,
        "{}",
        serde_json::to_string(record).map_err(|error| error.to_string())?
    )
    .map_err(|error| format!("failed to append {}: {error}", paths.runs_jsonl.display()))
}

pub fn make_run_record(input: RunRecordInput<'_>) -> Value {
    serde_json::json!({
        "run_id": input.run_id,
        "timestamp": current_timestamp_seconds(),
        "profile": input.profile,
        "mode": input.mode,
        "accepted": input.score.accepted,
        "committed": input.commit.is_some(),
        "commit": input.commit,
        "score": round(input.score.score),
        "stability": round(input.score.stability),
        "latency": round(input.score.latency),
        "throughput": round(input.score.throughput),
        "log_quality": round(input.score.log_quality),
        "test_quality": round(input.score.test_quality),
        "reject_reasons": input.score.reject_reasons,
        "improvements": input.score.improvements,
        "degradations": input.score.degradations,
        "algorithm_architecture_improvements": input.algorithm_architecture_improvements,
        "generated_diff": input.observation.generated_diff,
        "patch": input.patch.serializable(),
        "report": input.report_path.display().to_string(),
        "gates": input.observation.gates,
        "metrics": input.observation.metrics,
        "log_findings": input.observation.log_findings,
    })
}

pub fn previous_scored_run(paths: &HistoryPaths, profile: &str) -> Result<Option<Value>, String> {
    let runs = load_runs(paths)?;
    Ok(runs
        .into_iter()
        .filter(|run| run.get("profile").and_then(Value::as_str) == Some(profile))
        .filter(|run| {
            run.get("accepted")
                .and_then(Value::as_bool)
                .unwrap_or(false)
        })
        .filter(accepted_run_has_committed_baseline)
        .filter(|run| run.get("score").and_then(Value::as_f64).is_some())
        .max_by_key(|run| run.get("timestamp").and_then(Value::as_u64).unwrap_or(0)))
}

fn accepted_run_has_committed_baseline(run: &Value) -> bool {
    run.get("committed")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        && run
            .get("commit")
            .and_then(Value::as_str)
            .is_some_and(|commit| !commit.trim().is_empty())
}

pub fn load_runs(paths: &HistoryPaths) -> Result<Vec<Value>, String> {
    if !paths.runs_jsonl.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&paths.runs_jsonl)
        .map_err(|error| format!("failed to read runs: {error}"))?;
    content
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| serde_json::from_str(line).map_err(|error| error.to_string()))
        .collect()
}

pub fn write_memory(paths: &HistoryPaths, record: &Value) -> Result<(), String> {
    paths.ensure()?;
    let run_id = record
        .get("run_id")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let path = paths.memory.join(format!("{run_id}.json"));
    fs::write(
        &path,
        serde_json::to_string_pretty(record).map_err(|error| error.to_string())? + "\n",
    )
    .map_err(|error| format!("failed to write memory: {error}"))
}

pub fn append_algorithm_architecture_markdown(
    paths: &HistoryPaths,
    record: &Value,
) -> Result<(), String> {
    let Some(improvements) = record
        .get("algorithm_architecture_improvements")
        .and_then(Value::as_array)
    else {
        return Ok(());
    };
    if improvements.is_empty() {
        return Ok(());
    }
    paths.ensure()?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&paths.algorithm_architecture_markdown)
        .map_err(|error| {
            format!(
                "failed to open {}: {error}",
                paths.algorithm_architecture_markdown.display()
            )
        })?;
    writeln!(
        file,
        "\n## {}\n\n- profile: {}\n- accepted: {}\n- score: {}\n- patch: `{}`\n",
        text(record, "run_id"),
        text(record, "profile"),
        record
            .get("accepted")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        record
            .get("score")
            .map(Value::to_string)
            .unwrap_or_default(),
        record
            .get("patch")
            .and_then(|patch| patch.get("path"))
            .and_then(Value::as_str)
            .unwrap_or("")
    )
    .map_err(|error| format!("failed to append architecture markdown: {error}"))?;
    for improvement in improvements {
        let area = improvement
            .get("area")
            .and_then(Value::as_str)
            .unwrap_or("unknown");
        let summary = improvement
            .get("improvement")
            .and_then(Value::as_str)
            .unwrap_or("");
        let evidence = improvement
            .get("evidence")
            .and_then(Value::as_str)
            .unwrap_or("");
        writeln!(file, "- `{area}`: {summary} Evidence: {evidence}")
            .map_err(|error| format!("failed to append architecture markdown: {error}"))?;
    }
    Ok(())
}

pub fn recent_memory(paths: &HistoryPaths, limit: usize) -> String {
    let Ok(runs) = load_runs(paths) else {
        return "No prior performance self-iteration memory.".to_owned();
    };
    let mut lines = Vec::new();
    for run in runs.into_iter().rev().take(limit) {
        lines.push(format!(
            "- run_id={} accepted={} score={} reasons={} architecture={} findings={}",
            text(&run, "run_id"),
            run.get("accepted")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            run.get("score").map(Value::to_string).unwrap_or_default(),
            run.get("reject_reasons")
                .map(Value::to_string)
                .unwrap_or_default(),
            architecture_improvement_summary(&run),
            log_finding_summary(&run)
        ));
    }
    if lines.is_empty() {
        "No prior performance self-iteration memory.".to_owned()
    } else {
        lines.join("\n")
    }
}

fn architecture_improvement_summary(run: &Value) -> String {
    let Some(items) = run
        .get("algorithm_architecture_improvements")
        .and_then(Value::as_array)
    else {
        return "[]".to_owned();
    };
    let entries = items
        .iter()
        .take(4)
        .map(|item| {
            let area = item
                .get("area")
                .and_then(Value::as_str)
                .unwrap_or("unknown");
            let improvement = item
                .get("improvement")
                .and_then(Value::as_str)
                .unwrap_or("")
                .chars()
                .take(180)
                .collect::<String>();
            format!("{area}:{improvement}")
        })
        .collect::<Vec<_>>();
    serde_json::to_string(&entries).unwrap_or_else(|_| "[]".to_owned())
}

pub fn export_score_csv(paths: &HistoryPaths) -> Result<PathBuf, String> {
    let runs = load_runs(paths)?;
    let mut csv = String::from(
        "run_id,timestamp,profile,accepted,committed,score,stability,latency,throughput,log_quality,test_quality,report,reject_reasons\n",
    );
    for run in runs {
        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{},{},{},{},{},{}\n",
            csv_field(&text(&run, "run_id")),
            run.get("timestamp").and_then(Value::as_u64).unwrap_or(0),
            csv_field(&text(&run, "profile")),
            run.get("accepted")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            run.get("committed")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            number(&run, "score"),
            number(&run, "stability"),
            number(&run, "latency"),
            number(&run, "throughput"),
            number(&run, "log_quality"),
            number(&run, "test_quality"),
            csv_field(&text(&run, "report")),
            csv_field(
                &run.get("reject_reasons")
                    .map(Value::to_string)
                    .unwrap_or_default()
            ),
        ));
    }
    fs::write(&paths.score_csv, csv)
        .map_err(|error| format!("failed to write {}: {error}", paths.score_csv.display()))?;
    Ok(paths.score_csv.clone())
}

fn current_timestamp_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn round(value: f64) -> f64 {
    (value * 1_000_000.0).round() / 1_000_000.0
}

fn text(run: &Value, key: &str) -> String {
    run.get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned()
}

fn number(run: &Value, key: &str) -> String {
    run.get(key)
        .and_then(Value::as_f64)
        .map(|value| format!("{value:.6}"))
        .unwrap_or_default()
}

fn log_finding_summary(run: &Value) -> String {
    let Some(findings) = run.get("log_findings").and_then(Value::as_array) else {
        return "[]".to_owned();
    };
    let entries = findings
        .iter()
        .take(6)
        .map(|finding| {
            let severity = finding
                .get("severity")
                .and_then(Value::as_str)
                .unwrap_or("UNKNOWN");
            let signature = finding
                .get("signature")
                .and_then(Value::as_str)
                .unwrap_or("");
            let count = finding.get("count").and_then(Value::as_u64).unwrap_or(0);
            let sample = finding
                .get("sample")
                .and_then(Value::as_str)
                .unwrap_or("")
                .chars()
                .take(180)
                .collect::<String>();
            format!("{severity}:{signature} count={count} sample={sample}")
        })
        .collect::<Vec<_>>();
    serde_json::to_string(&entries).unwrap_or_else(|_| "[]".to_owned())
}

fn csv_field(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recent_memory_includes_log_findings() {
        let root =
            std::env::temp_dir().join(format!("relay-teams-history-memory-{}", std::process::id()));
        let paths = HistoryPaths {
            patches: root.join("patches"),
            reports: root.join("reports"),
            memory: root.join("memory"),
            runs_jsonl: root.join("runs.jsonl"),
            score_csv: root.join("score.csv"),
            algorithm_architecture_markdown: root.join("algorithm-architecture-improvements.md"),
            root,
        };
        paths.ensure().unwrap();
        append_run(
            &paths,
            &serde_json::json!({
                "run_id": "run-1",
                "timestamp": 1,
                "profile": "smoke",
                "accepted": true,
                "score": 0.9,
                "reject_reasons": [],
                "log_findings": [{
                    "severity": "WARNING",
                    "signature": "route.slow",
                    "count": 2,
                    "sample": "WARNING route.slow"
                }]
            }),
        )
        .unwrap();

        let memory = recent_memory(&paths, 1);
        let _ = fs::remove_dir_all(&paths.root);

        assert!(memory.contains("route.slow"));
        assert!(memory.contains("WARNING"));
    }

    #[test]
    fn algorithm_architecture_improvements_are_logged_and_recalled() {
        let root = std::env::temp_dir().join(format!(
            "relay-teams-history-architecture-{}",
            std::process::id()
        ));
        let paths = HistoryPaths {
            patches: root.join("patches"),
            reports: root.join("reports"),
            memory: root.join("memory"),
            runs_jsonl: root.join("runs.jsonl"),
            score_csv: root.join("score.csv"),
            algorithm_architecture_markdown: root.join("algorithm-architecture-improvements.md"),
            root,
        };
        paths.ensure().unwrap();
        let record = serde_json::json!({
            "run_id": "run-architecture",
            "timestamp": 1,
            "profile": "pressure-fast",
            "accepted": false,
            "score": 0.42,
            "reject_reasons": ["latency_p95_ms above budget"],
            "patch": {"path": "/tmp/candidate.patch"},
            "algorithm_architecture_improvements": [{
                "area": "src",
                "improvement": "Separated queue admission from SSE stream draining.",
                "evidence": "codex final notes"
            }],
            "log_findings": []
        });

        append_run(&paths, &record).unwrap();
        write_memory(&paths, &record).unwrap();
        append_algorithm_architecture_markdown(&paths, &record).unwrap();
        let memory = recent_memory(&paths, 1);
        let markdown = fs::read_to_string(&paths.algorithm_architecture_markdown).unwrap();
        let memory_json = fs::read_to_string(paths.memory.join("run-architecture.json")).unwrap();
        let _ = fs::remove_dir_all(&paths.root);

        assert!(memory.contains("Separated queue admission"));
        assert!(markdown.contains("run-architecture"));
        assert!(markdown.contains("Separated queue admission"));
        assert!(memory_json.contains("algorithm_architecture_improvements"));
    }

    #[test]
    fn previous_scored_run_uses_latest_accepted_run() {
        let root = std::env::temp_dir().join(format!(
            "relay-teams-history-baseline-{}",
            std::process::id()
        ));
        let paths = HistoryPaths {
            patches: root.join("patches"),
            reports: root.join("reports"),
            memory: root.join("memory"),
            runs_jsonl: root.join("runs.jsonl"),
            score_csv: root.join("score.csv"),
            algorithm_architecture_markdown: root.join("algorithm-architecture-improvements.md"),
            root,
        };
        paths.ensure().unwrap();
        for run in [
            serde_json::json!({
                "run_id": "accepted",
                "timestamp": 1,
                "profile": "full",
                "accepted": true,
                "committed": true,
                "commit": "1111111111111111111111111111111111111111",
                "score": 0.8
            }),
            serde_json::json!({
                "run_id": "rejected",
                "timestamp": 2,
                "profile": "full",
                "accepted": false,
                "score": 0.1
            }),
        ] {
            append_run(&paths, &run).unwrap();
        }

        let previous = previous_scored_run(&paths, "full").unwrap().unwrap();
        let _ = fs::remove_dir_all(&paths.root);

        assert_eq!(
            previous.get("run_id").and_then(Value::as_str),
            Some("accepted")
        );
    }

    #[test]
    fn previous_scored_run_ignores_uncommitted_accepted_run() {
        let root = std::env::temp_dir().join(format!(
            "relay-teams-history-uncommitted-baseline-{}",
            std::process::id()
        ));
        let paths = HistoryPaths {
            patches: root.join("patches"),
            reports: root.join("reports"),
            memory: root.join("memory"),
            runs_jsonl: root.join("runs.jsonl"),
            score_csv: root.join("score.csv"),
            algorithm_architecture_markdown: root.join("algorithm-architecture-improvements.md"),
            root,
        };
        paths.ensure().unwrap();
        for run in [
            serde_json::json!({
                "run_id": "committed",
                "timestamp": 1,
                "profile": "full",
                "accepted": true,
                "committed": true,
                "commit": "1111111111111111111111111111111111111111",
                "score": 0.8
            }),
            serde_json::json!({
                "run_id": "uncommitted",
                "timestamp": 2,
                "profile": "full",
                "accepted": true,
                "committed": false,
                "commit": null,
                "score": 0.95
            }),
        ] {
            append_run(&paths, &run).unwrap();
        }

        let previous = previous_scored_run(&paths, "full").unwrap().unwrap();
        let _ = fs::remove_dir_all(&paths.root);

        assert_eq!(
            previous.get("run_id").and_then(Value::as_str),
            Some("committed")
        );
    }

    fn run(dir: &Path, args: &[&str]) {
        let status = Command::new("git")
            .args(args)
            .current_dir(dir)
            .status()
            .unwrap();
        assert!(status.success(), "git command failed: {args:?}");
    }

    #[test]
    fn history_paths_use_resolved_git_storage_path() {
        let root = std::env::temp_dir().join(format!(
            "relay-teams-history-git-path-{}",
            std::process::id()
        ));
        let repo = root.join("repo");
        let worktree = root.join("linked");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&repo).unwrap();
        run(&repo, &["init", "-b", "main"]);
        fs::write(repo.join("tracked.txt"), "base\n").unwrap();
        run(&repo, &["add", "tracked.txt"]);
        run(
            &repo,
            &[
                "-c",
                "user.email=test@example.com",
                "-c",
                "user.name=Test",
                "commit",
                "-m",
                "init",
            ],
        );
        run(&repo, &["worktree", "add", "../linked"]);

        let paths = HistoryPaths::new(&worktree).unwrap();
        paths.ensure().unwrap();
        let _ = fs::remove_dir_all(&root);

        assert!(paths.root.ends_with("relay-teams-performance-iteration"));
        assert!(!paths.root.starts_with(worktree.join(".git")));
    }
}
