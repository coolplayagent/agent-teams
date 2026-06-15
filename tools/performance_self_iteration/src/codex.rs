use crate::{
    command::{CommandResult, CommandSpec, run_command},
    config::Cli,
    history::{HistoryPaths, recent_memory},
};

pub fn run_codex(cli: &Cli, prompt: &str) -> Result<CommandResult, String> {
    let command = build_codex_command(cli);
    if cli.dry_run_codex {
        return Ok(CommandResult {
            name: "codex_generation".to_owned(),
            command,
            exit_code: 0,
            duration_ms: 0,
            stdout: "dry-run: codex was not invoked\n".to_owned(),
            stderr: String::new(),
        });
    }
    Ok(run_command(
        &CommandSpec::new(
            "codex_generation",
            command,
            &cli.workspace,
            cli.codex_timeout_seconds,
        )
        .with_stdin(prompt.to_owned()),
    ))
}

pub fn build_codex_command(cli: &Cli) -> Vec<String> {
    let mut command = vec![cli.codex_path.clone()];
    if cli.effective_yolo() {
        command.extend(["-a".to_owned(), "never".to_owned()]);
    }
    command.extend([
        "exec".to_owned(),
        "-C".to_owned(),
        cli.workspace.display().to_string(),
    ]);
    if cli.effective_yolo() {
        command.extend([
            "--dangerously-bypass-approvals-and-sandbox".to_owned(),
            "-s".to_owned(),
            "danger-full-access".to_owned(),
        ]);
    }
    if let Some(profile) = &cli.codex_profile {
        command.extend(["-p".to_owned(), profile.clone()]);
    }
    command.extend(["-m".to_owned(), cli.model.clone()]);
    command.extend([
        "-c".to_owned(),
        format!("model_reasoning_effort=\"{}\"", cli.codex_reasoning_effort),
    ]);
    command.push("-".to_owned());
    command
}

pub fn build_prompt(cli: &Cli, paths: &HistoryPaths, run_id: &str) -> Result<String, String> {
    let memory = recent_memory(paths, 8);
    let pressure = cli.pressure_config();
    Ok(format!(
        r#"You are running relay-teams performance self-iteration run {run_id}.

Goal:
- Improve high-concurrency HTTP/SSE backend stability and latency.
- Under the Rust pressure harness, key API paths must not return `Server is busy`, 503, 429, or 5xx.
- `/api/system/live` must stay responsive while runs and session reads are under pressure.
- SSE streams must reach terminal events without deadlock.
- WARNING and ERROR logs are improvement signals; ERROR logs must be fixed, WARNING logs should be reduced or explained by targeted code changes.

Constraints:
- Follow AGENTS.md.
- Use Python project patterns for product code: async paths stay async, use pathlib in Python, keep Pydantic contracts explicit.
- Do not bypass pre-commit checks.
- Do not create commits; the Rust harness owns accepted commits.
- Prefer general queueing, isolation, timeout, logging, or benchmark improvements over fixture-specific behavior.
- For repo inspection, prefer `rg`.
- In the final notes, include a section named `Algorithm architecture improvements:` with 1-3 bullets. Each bullet should record the candidate's algorithm or architecture change, the affected subsystem, and why it should improve stability, latency, or pressure behavior.

Workspace: {workspace}
Evaluation profile: {profile}
Pressure target: base_url={base_url}, concurrency={concurrency}, duration_seconds={duration}, sessions={sessions}

Recent performance self-iteration memory:
{memory}

Make one concrete candidate change now. If you change performance behavior, add or update focused tests or benchmark coverage. In the final notes, state which warning/error or latency/busy failure the change addresses and include the required algorithm architecture improvement bullets.
"#,
        workspace = cli.workspace.display(),
        profile = cli.profile,
        base_url = pressure.base_url,
        concurrency = pressure.concurrency,
        duration = pressure.duration_seconds,
        sessions = pressure.sessions,
    ))
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use crate::config::{Cli, Mode};

    use super::*;

    #[test]
    fn yolo_adds_noninteractive_flags() {
        let cli = Cli {
            mode: Mode::Once,
            workspace: PathBuf::from("."),
            profile: "smoke".to_owned(),
            base_url: "http://127.0.0.1:8000".to_owned(),
            concurrency: 1,
            duration_seconds: 1,
            sessions: 1,
            request_timeout_seconds: 1,
            log_files: Vec::new(),
            max_iterations: None,
            stop_after_accepted: None,
            sleep_seconds: 1,
            yolo: true,
            no_yolo: false,
            dry_run_codex: false,
            use_current_candidate: false,
            fail_fast: false,
            commit_accepted: false,
            commit_message: None,
            codex_path: "codex".to_owned(),
            model: "gpt-5.5".to_owned(),
            codex_reasoning_effort: "xhigh".to_owned(),
            codex_profile: None,
            codex_timeout_seconds: 1,
            command_timeout_seconds: 1,
        };
        let command = build_codex_command(&cli);
        assert!(command.iter().any(|item| item == "-a"));
        assert!(
            command
                .iter()
                .any(|item| item == "--dangerously-bypass-approvals-and-sandbox")
        );
    }

    #[test]
    fn no_yolo_omits_noninteractive_flags() {
        let cli = Cli {
            mode: Mode::Once,
            workspace: PathBuf::from("."),
            profile: "smoke".to_owned(),
            base_url: "http://127.0.0.1:8000".to_owned(),
            concurrency: 1,
            duration_seconds: 1,
            sessions: 1,
            request_timeout_seconds: 1,
            log_files: Vec::new(),
            max_iterations: None,
            stop_after_accepted: None,
            sleep_seconds: 1,
            yolo: true,
            no_yolo: true,
            dry_run_codex: false,
            use_current_candidate: false,
            fail_fast: false,
            commit_accepted: false,
            commit_message: None,
            codex_path: "codex".to_owned(),
            model: "gpt-5.5".to_owned(),
            codex_reasoning_effort: "xhigh".to_owned(),
            codex_profile: None,
            codex_timeout_seconds: 1,
            command_timeout_seconds: 1,
        };
        let command = build_codex_command(&cli);
        assert!(!command.iter().any(|item| item == "-a"));
        assert!(
            !command
                .iter()
                .any(|item| item == "--dangerously-bypass-approvals-and-sandbox")
        );
    }

    #[test]
    fn prompt_uses_effective_pressure_profile() {
        let root =
            std::env::temp_dir().join(format!("relay-teams-codex-prompt-{}", std::process::id()));
        let paths = HistoryPaths {
            patches: root.join("patches"),
            reports: root.join("reports"),
            memory: root.join("memory"),
            runs_jsonl: root.join("runs.jsonl"),
            score_csv: root.join("score.csv"),
            algorithm_architecture_markdown: root.join("algorithm-architecture-improvements.md"),
            root,
        };
        let cli = Cli {
            mode: Mode::Once,
            workspace: PathBuf::from("."),
            profile: "pressure-full".to_owned(),
            base_url: "http://127.0.0.1:8000/".to_owned(),
            concurrency: 8,
            duration_seconds: 10,
            sessions: 2,
            request_timeout_seconds: 1,
            log_files: Vec::new(),
            max_iterations: None,
            stop_after_accepted: None,
            sleep_seconds: 1,
            yolo: false,
            no_yolo: false,
            dry_run_codex: false,
            use_current_candidate: false,
            fail_fast: false,
            commit_accepted: false,
            commit_message: None,
            codex_path: "codex".to_owned(),
            model: "gpt-5.5".to_owned(),
            codex_reasoning_effort: "xhigh".to_owned(),
            codex_profile: None,
            codex_timeout_seconds: 1,
            command_timeout_seconds: 1,
        };

        let prompt = build_prompt(&cli, &paths, "run-1").unwrap();

        assert!(prompt.contains("concurrency=100"));
        assert!(prompt.contains("duration_seconds=300"));
        assert!(prompt.contains("sessions=24"));
        assert!(prompt.contains("base_url=http://127.0.0.1:8000"));
        assert!(prompt.contains("Algorithm architecture improvements:"));
    }
}
