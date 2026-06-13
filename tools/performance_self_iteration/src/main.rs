mod codex;
mod command;
mod config;
mod git_ops;
mod history;
mod log_scan;
mod pressure;
mod scoring;

use std::{
    net::{IpAddr, TcpStream, ToSocketAddrs},
    time::{Duration, Instant},
};

use config::{Cli, Mode};

#[tokio::main(flavor = "multi_thread")]
async fn main() {
    let cli = Cli::parse_args();
    let exit_code = match run(cli).await {
        Ok(code) => code,
        Err(error) => {
            eprintln!("[perf-iterate] {error}");
            1
        }
    };
    std::process::exit(exit_code);
}

async fn run(mut cli: Cli) -> Result<i32, String> {
    cli.validate_profile()?;
    cli.workspace = cli
        .workspace
        .canonicalize()
        .map_err(|error| format!("invalid workspace {}: {error}", cli.workspace.display()))?;
    let paths = history::HistoryPaths::new(&cli.workspace)?;
    paths.ensure()?;
    match cli.mode {
        Mode::Chart => {
            let path = history::export_score_csv(&paths)?;
            println!("score csv: {}", path.display());
            Ok(0)
        }
        Mode::Evaluate => evaluate_current(&cli, &paths).await,
        Mode::Once => run_generation_iteration(&cli, &paths).await,
        Mode::Loop => run_loop(&cli, &paths).await,
    }
}

async fn run_loop(cli: &Cli, paths: &history::HistoryPaths) -> Result<i32, String> {
    if !cli.use_current_candidate {
        git_ops::ensure_clean_worktree(&cli.workspace)?;
    }
    let max_iterations = cli.max_iterations.unwrap_or(usize::MAX);
    let mut accepted_count = 0usize;
    for iteration in 1..=max_iterations {
        if cli
            .stop_after_accepted
            .is_some_and(|limit| accepted_count >= limit)
        {
            return Ok(0);
        }
        println!("[perf-iterate] iteration {iteration} starting");
        let iteration_exit_code = match run_generation_iteration(cli, paths).await {
            Ok(0) => {
                accepted_count += 1;
                if cli.commit_accepted && git_ops::head_commit_touches_harness(&cli.workspace)? {
                    println!(
                        "[perf-iterate] accepted harness change committed; stopping loop so wrapper can rebuild"
                    );
                    return Ok(0);
                }
                0
            }
            Ok(code) => code,
            Err(error) => return Err(error),
        };
        if cli.use_current_candidate {
            println!("[perf-iterate] current candidate evaluated; stopping loop");
            return Ok(iteration_exit_code);
        }
        if cli.fail_fast && iteration_exit_code != 0 {
            println!("[perf-iterate] iteration rejected; fail-fast stopping loop");
            return Ok(iteration_exit_code);
        }
        tokio::time::sleep(std::time::Duration::from_secs(cli.sleep_seconds)).await;
        if !cli.commit_accepted && accepted_count > 0 {
            println!("[perf-iterate] accepted candidate left in working tree; stopping loop");
            return Ok(0);
        }
    }
    Ok(0)
}

async fn evaluate_current(cli: &Cli, paths: &history::HistoryPaths) -> Result<i32, String> {
    let run_id = history::new_run_id("evaluate");
    let base_ref = "HEAD".to_owned();
    reject_current_candidate_ignore_rule_changes(&cli.workspace, &base_ref)?;
    let ignored_snapshot = git_ops::IgnoredOutputSnapshot::capture(&cli.workspace)?;
    let patch = git_ops::capture_patch(
        &cli.workspace,
        paths,
        &run_id,
        &base_ref,
        Some(&ignored_snapshot),
    )?;
    let previous = history::previous_scored_run(paths, &cli.profile)?;
    let evaluation = evaluate_candidate(cli, paths, &run_id, &patch).await?;
    let score = scoring::score_evaluation(&evaluation.observation, previous.as_ref());
    let report_path = history::write_report(paths, &run_id, &evaluation.report)?;
    let record = history::make_run_record(history::RunRecordInput {
        run_id: &run_id,
        profile: &cli.profile,
        mode: "evaluate",
        patch: &patch,
        report_path: &report_path,
        score: &score,
        observation: &evaluation.observation,
        commit: None,
    });
    history::append_run(paths, &record)?;
    history::write_memory(paths, &record)?;
    println!(
        "[perf-iterate] score={:.6} accepted={} reasons={}",
        score.score,
        score.accepted,
        score.reject_reasons.join("; ")
    );
    Ok(if score.accepted { 0 } else { 1 })
}

async fn run_generation_iteration(cli: &Cli, paths: &history::HistoryPaths) -> Result<i32, String> {
    let run_id = history::new_run_id("run");
    let previous = history::previous_scored_run(paths, &cli.profile)?;
    if !cli.use_current_candidate {
        git_ops::ensure_clean_worktree(&cli.workspace)?;
    }
    let base_state = git_ops::capture_head_state(&cli.workspace)?;
    if cli.use_current_candidate {
        reject_current_candidate_ignore_rule_changes(&cli.workspace, &base_state.commit)?;
    }
    let ignored_snapshot = Some(git_ops::IgnoredOutputSnapshot::capture(&cli.workspace)?);
    let git_metadata_snapshot = if cli.use_current_candidate {
        None
    } else {
        Some(git_ops::GitMetadataSnapshot::capture(&cli.workspace)?)
    };
    let codex_result = if cli.use_current_candidate {
        println!("[perf-iterate] using current working tree as candidate");
        None
    } else {
        let prompt = codex::build_prompt(cli, paths, &run_id)?;
        let result = codex::run_codex(cli, &prompt)?;
        println!(
            "[perf-iterate] codex exit={} duration_ms={}",
            result.exit_code, result.duration_ms
        );
        Some(result)
    };
    if let Some(snapshot) = &git_metadata_snapshot {
        match snapshot.restore_if_changed(&cli.workspace) {
            Ok(Some(error)) | Err(error) => {
                reject_patch_capture_failure(
                    cli,
                    paths,
                    &run_id,
                    &error,
                    &base_state,
                    ignored_snapshot.as_ref(),
                    previous.as_ref(),
                )
                .await?;
                return Ok(1);
            }
            Ok(None) => {}
        }
    }
    let current_state = git_ops::capture_head_state(&cli.workspace)?;
    if head_changed_after_generation(cli.use_current_candidate, &base_state, &current_state) {
        let patch = match git_ops::capture_patch(
            &cli.workspace,
            paths,
            &run_id,
            &base_state.commit,
            ignored_snapshot.as_ref(),
        ) {
            Ok(patch) => patch,
            Err(error) => {
                reject_patch_capture_failure(
                    cli,
                    paths,
                    &run_id,
                    &error,
                    &base_state,
                    ignored_snapshot.as_ref(),
                    previous.as_ref(),
                )
                .await?;
                return Ok(1);
            }
        };
        let evaluation = scoring::EvaluationRun::from_failed_gate(
            "codex_committed",
            patch.has_diff,
            codex_result
                .as_ref()
                .map(|result| result.duration_ms)
                .unwrap_or(0),
            "Codex created a Git commit; candidate commits are owned by the harness".to_owned(),
        );
        persist_and_reject(
            cli,
            paths,
            &run_id,
            &patch,
            &evaluation,
            &base_state,
            ignored_snapshot.as_ref(),
            previous.as_ref(),
        )
        .await?;
        return Ok(1);
    }
    let patch = match git_ops::capture_patch(
        &cli.workspace,
        paths,
        &run_id,
        &base_state.commit,
        ignored_snapshot.as_ref(),
    ) {
        Ok(patch) => patch,
        Err(error) => {
            reject_patch_capture_failure(
                cli,
                paths,
                &run_id,
                &error,
                &base_state,
                ignored_snapshot.as_ref(),
                previous.as_ref(),
            )
            .await?;
            return Ok(1);
        }
    };
    if codex_result
        .as_ref()
        .is_some_and(|result| result.exit_code != 0)
    {
        let evaluation = scoring::EvaluationRun::from_failed_gate(
            "codex_generation",
            patch.has_diff,
            codex_result
                .as_ref()
                .map(|result| result.duration_ms)
                .unwrap_or(0),
            codex_result
                .as_ref()
                .map(|result| command::last_output_line(&result.stdout, &result.stderr))
                .unwrap_or_default(),
        );
        persist_and_reject(
            cli,
            paths,
            &run_id,
            &patch,
            &evaluation,
            &base_state,
            ignored_snapshot.as_ref(),
            previous.as_ref(),
        )
        .await?;
        return Ok(1);
    }
    if !patch.has_diff {
        let evaluation = scoring::EvaluationRun::empty(false);
        persist_and_reject(
            cli,
            paths,
            &run_id,
            &patch,
            &evaluation,
            &base_state,
            ignored_snapshot.as_ref(),
            previous.as_ref(),
        )
        .await?;
        return Ok(1);
    }
    println!("[perf-iterate] candidate patch: {}", patch.path.display());
    let evaluation = match evaluate_candidate(cli, paths, &run_id, &patch).await {
        Ok(evaluation) => evaluation,
        Err(error) => {
            let evaluation = scoring::EvaluationRun::from_failed_gate(
                "candidate_evaluation",
                patch.has_diff,
                0,
                error,
            );
            persist_and_reject(
                cli,
                paths,
                &run_id,
                &patch,
                &evaluation,
                &base_state,
                ignored_snapshot.as_ref(),
                previous.as_ref(),
            )
            .await?;
            return Ok(1);
        }
    };
    let score = scoring::score_evaluation(&evaluation.observation, previous.as_ref());
    let mut acceptance_error = None;
    let commit = if score.accepted && cli.commit_accepted {
        match git_ops::verify_patch_unchanged(
            &cli.workspace,
            paths,
            &run_id,
            &base_state.commit,
            ignored_snapshot.as_ref(),
            &patch,
        )
        .and_then(|_| {
            git_ops::commit_candidate(
                &cli.workspace,
                cli.commit_message.as_deref(),
                score.score,
                ignored_snapshot.as_ref(),
            )
        }) {
            Ok(commit) => Some(commit),
            Err(error) => {
                acceptance_error = Some(error);
                None
            }
        }
    } else {
        None
    };
    let final_evaluation;
    let final_score;
    let acceptance_failed = acceptance_error.is_some();
    let (evaluation, score) = if let Some(error) = acceptance_error {
        final_evaluation =
            scoring::EvaluationRun::from_failed_gate("accepted_commit", patch.has_diff, 0, error);
        final_score = scoring::score_evaluation(&final_evaluation.observation, previous.as_ref());
        (&final_evaluation, &final_score)
    } else {
        (&evaluation, &score)
    };
    let persist_result = (|| -> Result<(), String> {
        let report_path = history::write_report(paths, &run_id, &evaluation.report)?;
        let record = history::make_run_record(history::RunRecordInput {
            run_id: &run_id,
            profile: &cli.profile,
            mode: "once",
            patch: &patch,
            report_path: &report_path,
            score,
            observation: &evaluation.observation,
            commit: commit.as_deref(),
        });
        history::append_run(paths, &record)?;
        history::write_memory(paths, &record)?;
        Ok(())
    })();
    println!(
        "[perf-iterate] score={:.6} accepted={} reasons={}",
        score.score,
        score.accepted,
        score.reject_reasons.join("; ")
    );
    if acceptance_failed {
        let restore_result = if should_restore_rejected_candidate(cli.use_current_candidate) {
            let result =
                restore_candidate_worktree(&cli.workspace, &base_state, ignored_snapshot.as_ref());
            if result.is_ok() {
                println!("[perf-iterate] accepted candidate commit failed; restored working tree");
            }
            result
        } else {
            println!(
                "[perf-iterate] accepted current candidate commit failed; working tree preserved"
            );
            Ok(())
        };
        combine_persist_and_restore_results(persist_result, restore_result)?;
        return Ok(1);
    }
    if score.accepted {
        persist_result?;
        if should_restore_generated_ignored_outputs(cli.use_current_candidate) {
            restore_accepted_ignored_outputs(&cli.workspace, ignored_snapshot.as_ref())?;
        }
        if cli.commit_accepted {
            println!(
                "[perf-iterate] accepted commit={}",
                commit.unwrap_or_default()
            );
        } else {
            println!("[perf-iterate] accepted candidate left in working tree");
        }
        Ok(0)
    } else {
        let restore_result = if should_restore_rejected_candidate(cli.use_current_candidate) {
            let result =
                restore_candidate_worktree(&cli.workspace, &base_state, ignored_snapshot.as_ref());
            if result.is_ok() {
                println!("[perf-iterate] rejected candidate and restored working tree");
            }
            result
        } else {
            println!("[perf-iterate] rejected current candidate; working tree preserved");
            Ok(())
        };
        combine_persist_and_restore_results(persist_result, restore_result)?;
        Ok(1)
    }
}

async fn persist_and_reject(
    cli: &Cli,
    paths: &history::HistoryPaths,
    run_id: &str,
    patch: &git_ops::PatchSnapshot,
    evaluation: &scoring::EvaluationRun,
    base_state: &git_ops::HeadState,
    ignored_snapshot: Option<&git_ops::IgnoredOutputSnapshot>,
    previous: Option<&serde_json::Value>,
) -> Result<(), String> {
    let persist_result = (|| -> Result<(), String> {
        let score = scoring::score_evaluation(&evaluation.observation, previous);
        let report_path = history::write_report(paths, run_id, &evaluation.report)?;
        let record = history::make_run_record(history::RunRecordInput {
            run_id,
            profile: &cli.profile,
            mode: "once",
            patch,
            report_path: &report_path,
            score: &score,
            observation: &evaluation.observation,
            commit: None,
        });
        history::append_run(paths, &record)?;
        history::write_memory(paths, &record)?;
        Ok(())
    })();
    let restore_result = if should_restore_rejected_candidate(cli.use_current_candidate) {
        restore_candidate_worktree(&cli.workspace, base_state, ignored_snapshot)
    } else {
        Ok(())
    };
    combine_persist_and_restore_results(persist_result, restore_result)
}

async fn reject_patch_capture_failure(
    cli: &Cli,
    paths: &history::HistoryPaths,
    run_id: &str,
    error: &str,
    base_state: &git_ops::HeadState,
    ignored_snapshot: Option<&git_ops::IgnoredOutputSnapshot>,
    previous: Option<&serde_json::Value>,
) -> Result<(), String> {
    let patch_result = git_ops::empty_patch_snapshot(paths, run_id);
    let patch = match patch_result {
        Ok(patch) => patch,
        Err(patch_error) => {
            let restore_result = if should_restore_rejected_candidate(cli.use_current_candidate) {
                restore_candidate_worktree(&cli.workspace, base_state, ignored_snapshot)
            } else {
                Ok(())
            };
            return combine_persist_and_restore_results(Err(patch_error), restore_result);
        }
    };
    let evaluation =
        scoring::EvaluationRun::from_failed_gate("patch_capture", false, 0, error.to_owned());
    persist_and_reject(
        cli,
        paths,
        run_id,
        &patch,
        &evaluation,
        base_state,
        ignored_snapshot,
        previous,
    )
    .await
}

fn combine_persist_and_restore_results(
    persist_result: Result<(), String>,
    restore_result: Result<(), String>,
) -> Result<(), String> {
    match (persist_result, restore_result) {
        (Ok(()), Ok(())) => Ok(()),
        (Err(error), Ok(())) | (Ok(()), Err(error)) => Err(error),
        (Err(persist_error), Err(restore_error)) => Err(format!(
            "{persist_error}; failed to restore rejected candidate: {restore_error}"
        )),
    }
}

fn should_restore_rejected_candidate(use_current_candidate: bool) -> bool {
    !use_current_candidate
}

fn reject_current_candidate_ignore_rule_changes(
    workspace: &std::path::Path,
    base_ref: &str,
) -> Result<(), String> {
    if git_ops::worktree_changes_ignore_rules(workspace, base_ref)? {
        Err(
            "current-candidate evaluation cannot change .gitignore rules; commit or revert those changes before using --use-current-candidate".to_owned(),
        )
    } else if git_ops::git_info_exclude_is_modified(workspace, base_ref)? {
        Err(
            "current-candidate evaluation cannot use modified, removed, or exposed .git/info/exclude rules; move ignore rules into tracked .gitignore or use generated candidate mode".to_owned(),
        )
    } else {
        Ok(())
    }
}

fn should_restore_generated_ignored_outputs(use_current_candidate: bool) -> bool {
    !use_current_candidate
}

fn restore_accepted_ignored_outputs(
    workspace: &std::path::Path,
    ignored_snapshot: Option<&git_ops::IgnoredOutputSnapshot>,
) -> Result<(), String> {
    if let Some(snapshot) = ignored_snapshot {
        git_ops::restore_ignored_outputs(workspace, snapshot)
    } else {
        Ok(())
    }
}

fn restore_candidate_worktree(
    workspace: &std::path::Path,
    base_state: &git_ops::HeadState,
    ignored_snapshot: Option<&git_ops::IgnoredOutputSnapshot>,
) -> Result<(), String> {
    if let Some(snapshot) = ignored_snapshot {
        git_ops::restore_worktree_after_candidate(workspace, base_state, snapshot)
    } else {
        git_ops::restore_worktree_state(workspace, base_state)
    }
}

fn head_changed_after_generation(
    use_current_candidate: bool,
    base_state: &git_ops::HeadState,
    current_state: &git_ops::HeadState,
) -> bool {
    !use_current_candidate && current_state != base_state
}

fn smoke_acceptance_disabled_gate() -> scoring::GateObservation {
    scoring::GateObservation {
        name: "smoke_acceptance_disabled".to_owned(),
        passed: false,
        duration_ms: 0,
        message: "smoke profile does not run backend pressure and cannot accept candidates"
            .to_owned(),
    }
}

struct CandidateBackendCommands {
    start: command::CommandSpec,
    stop: command::CommandSpec,
    force_stop: command::CommandSpec,
    host: String,
    port: u16,
    backend_log: std::path::PathBuf,
}

fn candidate_backend_commands(
    cli: &Cli,
    paths: &history::HistoryPaths,
    run_id: &str,
) -> Result<Option<CandidateBackendCommands>, String> {
    if cli.profile == "smoke" {
        return Ok(None);
    }
    let pressure = cli.pressure_config();
    let url = reqwest::Url::parse(&pressure.base_url)
        .map_err(|error| format!("invalid pressure base-url {}: {error}", pressure.base_url))?;
    if url.scheme() != "http" {
        return Err("managed candidate backend requires an http loopback base-url".to_owned());
    }
    let host = url
        .host_str()
        .ok_or_else(|| format!("pressure base-url {} has no host", pressure.base_url))?;
    if !is_loopback_host(host) {
        return Err(format!(
            "managed candidate backend requires a loopback base-url, got {}",
            pressure.base_url
        ));
    }
    let port = url
        .port_or_known_default()
        .ok_or_else(|| format!("pressure base-url {} has no port", pressure.base_url))?;
    let backend_config_dir = paths.root.join("candidate-backends").join(run_id);
    let backend_log = backend_config_dir.join("log").join("backend.log");
    let backend_config_dir = backend_config_dir.display().to_string();
    let start = command::CommandSpec::new(
        "candidate_backend_start",
        vec![
            "uv".to_owned(),
            "run".to_owned(),
            "--locked".to_owned(),
            "--extra".to_owned(),
            "dev".to_owned(),
            "relay-teams".to_owned(),
            "server".to_owned(),
            "start".to_owned(),
            "--daemon".to_owned(),
            "--host".to_owned(),
            host.to_owned(),
            "--port".to_owned(),
            port.to_string(),
        ],
        &cli.workspace,
        cli.command_timeout_seconds,
    )
    .with_env("RELAY_TEAMS_CONFIG_DIR", backend_config_dir.clone());
    let stop = command::CommandSpec::new(
        "candidate_backend_stop",
        vec![
            "uv".to_owned(),
            "run".to_owned(),
            "--locked".to_owned(),
            "--extra".to_owned(),
            "dev".to_owned(),
            "relay-teams".to_owned(),
            "server".to_owned(),
            "stop".to_owned(),
            "--host".to_owned(),
            host.to_owned(),
            "--port".to_owned(),
            port.to_string(),
        ],
        &cli.workspace,
        cli.command_timeout_seconds,
    )
    .with_env("RELAY_TEAMS_CONFIG_DIR", backend_config_dir.clone());
    let force_stop = command::CommandSpec::new(
        "candidate_backend_force_stop",
        vec![
            "uv".to_owned(),
            "run".to_owned(),
            "--locked".to_owned(),
            "--extra".to_owned(),
            "dev".to_owned(),
            "relay-teams".to_owned(),
            "server".to_owned(),
            "stop".to_owned(),
            "--force".to_owned(),
            "--host".to_owned(),
            host.to_owned(),
            "--port".to_owned(),
            port.to_string(),
        ],
        &cli.workspace,
        cli.command_timeout_seconds,
    )
    .with_env("RELAY_TEAMS_CONFIG_DIR", backend_config_dir);
    Ok(Some(CandidateBackendCommands {
        start,
        stop,
        force_stop,
        host: host.to_owned(),
        port,
        backend_log,
    }))
}

fn is_loopback_host(host: &str) -> bool {
    if host.eq_ignore_ascii_case("localhost") {
        return true;
    }
    host.trim_matches(['[', ']'])
        .parse::<IpAddr>()
        .is_ok_and(|ip| ip.is_loopback())
}

fn gate_error(result: &command::CommandResult) -> String {
    format!("{} failed: {}", result.name, result.gate_message())
}

fn stop_candidate_backend(commands: &CandidateBackendCommands) -> Result<(), String> {
    let stop_result = command::run_command(&commands.stop);
    if !stop_result.passed() {
        let stop_error = gate_error(&stop_result);
        let force_stop_result = command::run_command(&commands.force_stop);
        if !force_stop_result.passed() {
            return Err(format!(
                "{stop_error}; forced cleanup also failed: {}",
                gate_error(&force_stop_result)
            ));
        }
        return Err(format!("{stop_error}; forced cleanup completed"));
    }
    if let Err(error) =
        wait_for_port_release(&commands.host, commands.port, commands.stop.timeout_seconds)
    {
        let force_stop_result = command::run_command(&commands.force_stop);
        if !force_stop_result.passed() {
            return Err(format!(
                "{error}; forced cleanup also failed: {}",
                gate_error(&force_stop_result)
            ));
        }
        return Err(format!("{error}; forced cleanup completed"));
    }
    Ok(())
}

fn prepare_candidate_backend(
    commands: &CandidateBackendCommands,
    timeout_seconds: u64,
) -> Result<(), String> {
    ensure_candidate_backend_port_available(&commands.host, commands.port, timeout_seconds)?;
    let start_result = command::run_command(&commands.start);
    if start_result.passed() {
        Ok(())
    } else {
        let start_error = gate_error(&start_result);
        let cleanup_result = command::run_command(&commands.force_stop);
        if cleanup_result.passed() {
            Err(format!("{start_error}; forced cleanup completed"))
        } else {
            Err(format!(
                "{start_error}; forced cleanup also failed: {}",
                gate_error(&cleanup_result)
            ))
        }
    }
}

fn ensure_candidate_backend_port_available(
    host: &str,
    port: u16,
    timeout_seconds: u64,
) -> Result<(), String> {
    let addrs = socket_addrs(host, port)?;
    let timeout = Duration::from_secs(timeout_seconds.clamp(1, 30));
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        let occupied = addrs
            .iter()
            .any(|addr| TcpStream::connect_timeout(addr, Duration::from_millis(100)).is_ok());
        if !occupied {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    Err(format!(
        "candidate backend port {host}:{port} is already occupied; choose a dedicated free --base-url port"
    ))
}

fn wait_for_port_release(host: &str, port: u16, timeout_seconds: u64) -> Result<(), String> {
    let timeout = Duration::from_secs(timeout_seconds.clamp(1, 30));
    let deadline = Instant::now() + timeout;
    let addrs = socket_addrs(host, port)?;
    while Instant::now() < deadline {
        let occupied = addrs
            .iter()
            .any(|addr| TcpStream::connect_timeout(addr, Duration::from_millis(100)).is_ok());
        if !occupied {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    Err(format!(
        "candidate backend port {host}:{port} did not release within {}s",
        timeout.as_secs()
    ))
}

fn socket_addrs(host: &str, port: u16) -> Result<Vec<std::net::SocketAddr>, String> {
    let addrs = (host, port)
        .to_socket_addrs()
        .map_err(|error| format!("failed to resolve {host}:{port}: {error}"))?
        .collect::<Vec<_>>();
    if addrs.is_empty() {
        return Err(format!(
            "failed to resolve {host}:{port}: no socket addresses"
        ));
    }
    Ok(addrs)
}

fn pressure_log_files(
    cli: &Cli,
    backend_commands: Option<&CandidateBackendCommands>,
) -> Vec<std::path::PathBuf> {
    let mut log_files = cli.log_files.clone();
    if let Some(commands) = backend_commands {
        log_files.push(commands.backend_log.clone());
    }
    log_files
}

async fn evaluate_candidate(
    cli: &Cli,
    paths: &history::HistoryPaths,
    run_id: &str,
    patch: &git_ops::PatchSnapshot,
) -> Result<scoring::EvaluationRun, String> {
    let mut gates = Vec::new();
    let mut report = serde_json::json!({
        "run_id": run_id,
        "profile": cli.profile,
        "generated_diff": patch.has_diff,
        "patch": patch.serializable(),
    });
    for gate in cli.quality_gates() {
        let result = command::run_command(&gate);
        gates.push(scoring::GateObservation::from_command(&result));
    }
    if cli.profile == "smoke" {
        gates.push(smoke_acceptance_disabled_gate());
    }
    let backend_commands = if cli.profile == "smoke" {
        None
    } else {
        let Some(backend_commands) = candidate_backend_commands(cli, paths, run_id)? else {
            return Err(
                "non-smoke pressure profiles require a managed candidate backend".to_owned(),
            );
        };
        Some(backend_commands)
    };
    let log_files = pressure_log_files(cli, backend_commands.as_ref());
    let log_windows = log_scan::capture_log_windows(&log_files)?;
    let pressure_result = if let Some(backend_commands) = backend_commands {
        if let Err(error) =
            prepare_candidate_backend(&backend_commands, cli.command_timeout_seconds)
        {
            let log_findings = log_scan::scan_log_windows(&log_windows)?;
            report["startup_error"] = serde_json::Value::String(error.clone());
            report["log_findings"] =
                serde_json::to_value(&log_findings).map_err(|e| e.to_string())?;
            gates.push(scoring::GateObservation {
                name: "candidate_backend_start".to_owned(),
                passed: false,
                duration_ms: 0,
                message: error,
            });
            return Ok(scoring::EvaluationRun {
                observation: scoring::EvaluationObservation {
                    generated_diff: patch.has_diff,
                    gates,
                    metrics: Vec::new(),
                    log_findings,
                },
                report,
            });
        }
        let pressure_result = pressure::run_pressure(cli.pressure_config()).await;
        let stop_result = stop_candidate_backend(&backend_commands);
        match (pressure_result, stop_result) {
            (Ok(report), Ok(())) => Ok(report),
            (Err(error), Ok(())) => Err(error),
            (Ok(_), Err(error)) => Err(error),
            (Err(pressure_error), Err(cleanup_error)) => Err(format!(
                "{pressure_error}; backend cleanup failed: {cleanup_error}"
            )),
        }
    } else {
        Ok(pressure::PressureReport::smoke())
    };
    let log_findings = log_scan::scan_log_windows(&log_windows)?;
    let pressure_result = match pressure_result {
        Ok(report) => report,
        Err(error) => {
            report["pressure_error"] = serde_json::Value::String(error.clone());
            report["log_findings"] =
                serde_json::to_value(&log_findings).map_err(|e| e.to_string())?;
            let mut failed_gates = gates;
            failed_gates.push(scoring::GateObservation {
                name: "pressure_run".to_owned(),
                passed: false,
                duration_ms: 0,
                message: error,
            });
            return Ok(scoring::EvaluationRun {
                observation: scoring::EvaluationObservation {
                    generated_diff: patch.has_diff,
                    gates: failed_gates,
                    metrics: Vec::new(),
                    log_findings,
                },
                report,
            });
        }
    };
    report["pressure"] = serde_json::to_value(&pressure_result).map_err(|e| e.to_string())?;
    report["log_findings"] = serde_json::to_value(&log_findings).map_err(|e| e.to_string())?;
    let observation = scoring::EvaluationObservation::from_parts(
        patch.has_diff,
        gates,
        pressure_result,
        log_findings,
    );
    Ok(scoring::EvaluationRun {
        observation,
        report,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, process::Command};

    fn test_cli(workspace: std::path::PathBuf) -> Cli {
        Cli {
            mode: Mode::Evaluate,
            workspace,
            profile: "pressure-fast".to_owned(),
            base_url: "http://127.0.0.1:8123".to_owned(),
            concurrency: 1,
            duration_seconds: 1,
            sessions: 1,
            request_timeout_seconds: 1,
            log_files: Vec::new(),
            max_iterations: None,
            stop_after_accepted: None,
            sleep_seconds: 1,
            yolo: false,
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
        }
    }

    fn run_git(workspace: &std::path::Path, args: &[&str]) {
        let output = Command::new("git")
            .args(args)
            .current_dir(workspace)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn initialized_worktree(name: &str) -> std::path::PathBuf {
        let workspace = std::env::temp_dir().join(format!("{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run_git(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run_git(&workspace, &["add", "tracked.txt"]);
        run_git(
            &workspace,
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
        workspace
    }

    fn test_history_paths(root: std::path::PathBuf) -> history::HistoryPaths {
        history::HistoryPaths {
            patches: root.join("patches"),
            reports: root.join("reports"),
            memory: root.join("memory"),
            runs_jsonl: root.join("runs.jsonl"),
            score_csv: root.join("score.csv"),
            root,
        }
    }

    #[test]
    fn current_candidate_rejections_preserve_worktree() {
        assert!(!should_restore_rejected_candidate(true));
        assert!(should_restore_rejected_candidate(false));
    }

    #[tokio::test]
    async fn current_candidate_rejection_preserves_worktree_with_ignored_snapshot() {
        let workspace = initialized_worktree("relay-teams-current-candidate-ignored-preserve");
        fs::write(workspace.join(".gitignore"), "secret.local\n").unwrap();
        run_git(&workspace, &["add", ".gitignore"]);
        run_git(
            &workspace,
            &[
                "-c",
                "user.email=test@example.com",
                "-c",
                "user.name=Test",
                "commit",
                "-m",
                "ignore secret",
            ],
        );
        fs::write(workspace.join("secret.local"), "original\n").unwrap();
        let ignored_snapshot = git_ops::IgnoredOutputSnapshot::capture(&workspace).unwrap();
        fs::write(workspace.join("secret.local"), "changed\n").unwrap();
        fs::write(workspace.join("candidate.txt"), "candidate\n").unwrap();
        let paths = history::HistoryPaths::new(&workspace).unwrap();
        paths.ensure().unwrap();
        let mut cli = test_cli(workspace.clone());
        cli.use_current_candidate = true;
        let base_state = git_ops::capture_head_state(&workspace).unwrap();
        let patch = git_ops::empty_patch_snapshot(&paths, "current-preserve").unwrap();
        let evaluation = scoring::EvaluationRun::empty(false);

        persist_and_reject(
            &cli,
            &paths,
            "current-preserve",
            &patch,
            &evaluation,
            &base_state,
            Some(&ignored_snapshot),
            None,
        )
        .await
        .unwrap();
        let candidate_exists = workspace.join("candidate.txt").exists();
        let secret = fs::read_to_string(workspace.join("secret.local")).unwrap();
        let _ = fs::remove_dir_all(&workspace);

        assert!(candidate_exists);
        assert_eq!(secret, "changed\n");
    }

    #[test]
    fn current_candidate_ignore_rule_changes_are_rejected() {
        let workspace = initialized_worktree("relay-teams-current-candidate-ignore-reject");
        fs::write(workspace.join(".gitignore"), "secret.local\n").unwrap();
        run_git(&workspace, &["add", ".gitignore"]);
        run_git(
            &workspace,
            &[
                "-c",
                "user.email=test@example.com",
                "-c",
                "user.name=Test",
                "commit",
                "-m",
                "ignore secret",
            ],
        );
        fs::write(workspace.join(".gitignore"), "").unwrap();

        let error = reject_current_candidate_ignore_rule_changes(&workspace, "HEAD").unwrap_err();
        let _ = fs::remove_dir_all(&workspace);

        assert!(error.contains("cannot change .gitignore"));
    }

    #[test]
    fn current_candidate_git_exclude_rules_are_rejected() {
        let workspace = initialized_worktree("relay-teams-current-candidate-exclude-reject");
        fs::write(
            workspace.join(".git").join("info").join("exclude"),
            "secret.local\n",
        )
        .unwrap();

        let error = reject_current_candidate_ignore_rule_changes(&workspace, "HEAD").unwrap_err();
        let _ = fs::remove_dir_all(&workspace);

        assert!(error.contains(".git/info/exclude"));
    }

    #[test]
    fn accepted_generated_candidate_restores_ignored_outputs_only() {
        let workspace = initialized_worktree("relay-teams-accepted-ignored-restore");
        fs::write(workspace.join(".gitignore"), "secret.local\n").unwrap();
        run_git(&workspace, &["add", ".gitignore"]);
        run_git(
            &workspace,
            &[
                "-c",
                "user.email=test@example.com",
                "-c",
                "user.name=Test",
                "commit",
                "-m",
                "ignore secret",
            ],
        );
        fs::write(workspace.join("secret.local"), "original\n").unwrap();
        let ignored_snapshot = git_ops::IgnoredOutputSnapshot::capture(&workspace).unwrap();
        fs::write(workspace.join("secret.local"), "changed\n").unwrap();
        fs::write(workspace.join("candidate.txt"), "candidate\n").unwrap();

        restore_accepted_ignored_outputs(&workspace, Some(&ignored_snapshot)).unwrap();
        let candidate_exists = workspace.join("candidate.txt").exists();
        let secret = fs::read_to_string(workspace.join("secret.local")).unwrap();
        let _ = fs::remove_dir_all(&workspace);

        assert!(candidate_exists);
        assert_eq!(secret, "original\n");
    }

    #[test]
    fn generated_commits_are_rejected_for_owned_candidates() {
        let base = git_ops::HeadState {
            commit: "base".to_owned(),
            branch: Some("main".to_owned()),
        };
        let new_commit = git_ops::HeadState {
            commit: "new".to_owned(),
            branch: Some("main".to_owned()),
        };
        let new_branch = git_ops::HeadState {
            commit: "base".to_owned(),
            branch: Some("candidate".to_owned()),
        };

        assert!(head_changed_after_generation(false, &base, &new_commit));
        assert!(head_changed_after_generation(false, &base, &new_branch));
        assert!(!head_changed_after_generation(false, &base, &base));
        assert!(!head_changed_after_generation(true, &base, &new_commit));
    }

    #[test]
    fn persist_and_restore_result_preserves_restore_errors() {
        let result = combine_persist_and_restore_results(
            Err("history failed".to_owned()),
            Err("restore failed".to_owned()),
        )
        .unwrap_err();

        assert!(result.contains("history failed"));
        assert!(result.contains("restore failed"));
    }

    #[test]
    fn persist_and_restore_result_returns_persist_error_after_restore() {
        let result = combine_persist_and_restore_results(Err("history failed".to_owned()), Ok(()))
            .unwrap_err();

        assert_eq!(result, "history failed");
    }

    #[tokio::test]
    async fn persist_uses_preloaded_baseline_after_history_mutation() {
        let workspace = initialized_worktree("relay-teams-preloaded-baseline");
        let paths = history::HistoryPaths::new(&workspace).unwrap();
        paths.ensure().unwrap();
        let previous_record = serde_json::json!({
            "run_id": "previous",
            "timestamp": 1,
            "profile": "pressure-fast",
            "accepted": true,
            "committed": true,
            "commit": "1111111111111111111111111111111111111111",
            "score": 1.0,
            "stability": 1.0,
            "log_quality": 1.0
        });
        history::append_run(&paths, &previous_record).unwrap();
        let previous = history::previous_scored_run(&paths, "pressure-fast")
            .unwrap()
            .unwrap();
        fs::write(&paths.runs_jsonl, "").unwrap();
        fs::write(workspace.join("candidate.txt"), "candidate\n").unwrap();
        let patch =
            git_ops::capture_patch(&workspace, &paths, "preloaded-baseline", "HEAD", None).unwrap();
        let evaluation = scoring::EvaluationRun {
            observation: scoring::EvaluationObservation {
                generated_diff: true,
                gates: vec![scoring::GateObservation {
                    name: "quality".to_owned(),
                    passed: true,
                    duration_ms: 1,
                    message: "ok".to_owned(),
                }],
                metrics: Vec::new(),
                log_findings: Vec::new(),
            },
            report: serde_json::json!({"generated_diff": true}),
        };
        let cli = test_cli(workspace.clone());
        let base_state = git_ops::capture_head_state(&workspace).unwrap();
        let ignored_snapshot = git_ops::IgnoredOutputSnapshot::capture(&workspace).unwrap();

        persist_and_reject(
            &cli,
            &paths,
            "preloaded-baseline",
            &patch,
            &evaluation,
            &base_state,
            Some(&ignored_snapshot),
            Some(&previous),
        )
        .await
        .unwrap();
        let runs = fs::read_to_string(&paths.runs_jsonl).unwrap();
        let _ = fs::remove_dir_all(&workspace);

        assert!(runs.contains("score did not improve beyond epsilon"));
    }

    #[test]
    fn smoke_profile_adds_acceptance_blocking_gate() {
        let gate = smoke_acceptance_disabled_gate();

        assert_eq!(gate.name, "smoke_acceptance_disabled");
        assert!(!gate.passed);
    }

    #[tokio::test]
    async fn current_candidate_loop_stops_after_single_no_diff_evaluation() {
        let workspace = initialized_worktree("relay-teams-current-candidate-loop");
        let paths = history::HistoryPaths::new(&workspace).unwrap();
        paths.ensure().unwrap();
        let mut cli = test_cli(workspace.clone());
        cli.mode = Mode::Loop;
        cli.profile = "smoke".to_owned();
        cli.use_current_candidate = true;

        let exit_code = run_loop(&cli, &paths).await.unwrap();
        let runs = fs::read_to_string(&paths.runs_jsonl).unwrap();
        let _ = fs::remove_dir_all(&workspace);

        assert_eq!(exit_code, 1);
        assert_eq!(runs.lines().count(), 1);
    }

    #[tokio::test]
    async fn fail_fast_loop_stops_after_rejected_generated_candidate() {
        let workspace = initialized_worktree("relay-teams-fail-fast-rejected");
        let paths = history::HistoryPaths::new(&workspace).unwrap();
        paths.ensure().unwrap();
        let mut cli = test_cli(workspace.clone());
        cli.mode = Mode::Loop;
        cli.profile = "smoke".to_owned();
        cli.dry_run_codex = true;
        cli.fail_fast = true;
        cli.max_iterations = Some(3);
        cli.sleep_seconds = 0;

        let exit_code = run_loop(&cli, &paths).await.unwrap();
        let runs = fs::read_to_string(&paths.runs_jsonl).unwrap();
        let _ = fs::remove_dir_all(&workspace);

        assert_eq!(exit_code, 1);
        assert_eq!(runs.lines().count(), 1);
    }

    #[tokio::test]
    async fn patch_capture_failures_restore_owned_candidates() {
        let workspace = initialized_worktree("relay-teams-patch-capture-restore");
        let paths = history::HistoryPaths::new(&workspace).unwrap();
        paths.ensure().unwrap();
        let cli = test_cli(workspace.clone());
        let base_state = git_ops::capture_head_state(&workspace).unwrap();
        let ignored_snapshot = git_ops::IgnoredOutputSnapshot::capture(&workspace).unwrap();
        let candidate_file = workspace.join("candidate.txt");
        fs::write(&candidate_file, "candidate\n").unwrap();

        reject_patch_capture_failure(
            &cli,
            &paths,
            "run-capture-failed",
            "candidate patch exceeds limit",
            &base_state,
            Some(&ignored_snapshot),
            None,
        )
        .await
        .unwrap();
        let candidate_exists = candidate_file.exists();
        let runs = fs::read_to_string(&paths.runs_jsonl).unwrap();
        let _ = fs::remove_dir_all(&workspace);

        assert!(!candidate_exists);
        assert!(runs.contains("patch_capture"));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn final_history_write_failures_restore_rejected_generated_candidates() {
        use std::os::unix::fs::PermissionsExt;

        let workspace = initialized_worktree("relay-teams-final-history-restore");
        let fake_codex =
            std::env::temp_dir().join(format!("relay-teams-fake-codex-{}.sh", std::process::id()));
        let _ = fs::remove_file(&fake_codex);
        fs::write(
            &fake_codex,
            "#!/bin/sh\nprintf 'candidate\\n' > candidate.txt\n",
        )
        .unwrap();
        let mut executable = fs::metadata(&fake_codex).unwrap().permissions();
        executable.set_mode(0o755);
        fs::set_permissions(&fake_codex, executable).unwrap();
        let paths = history::HistoryPaths::new(&workspace).unwrap();
        paths.ensure().unwrap();
        let original_permissions = fs::metadata(&paths.reports).unwrap().permissions();
        let mut readonly = original_permissions.clone();
        readonly.set_mode(0o555);
        fs::set_permissions(&paths.reports, readonly).unwrap();
        let mut cli = test_cli(workspace.clone());
        cli.profile = "smoke".to_owned();
        cli.codex_path = fake_codex.display().to_string();
        cli.sleep_seconds = 0;

        let error = run_loop(&cli, &paths).await.unwrap_err();
        let candidate_exists = workspace.join("candidate.txt").exists();
        fs::set_permissions(&paths.reports, original_permissions).unwrap();
        let _ = fs::remove_file(&fake_codex);
        let _ = fs::remove_dir_all(&workspace);

        assert!(error.contains("failed to write"));
        assert!(!candidate_exists);
    }

    #[test]
    fn candidate_backend_commands_restart_loopback_server() {
        let cli = test_cli(std::path::PathBuf::from("."));
        let paths = test_history_paths(std::path::PathBuf::from("/tmp/perf-history"));

        let Some(commands) = candidate_backend_commands(&cli, &paths, "run-123").unwrap() else {
            panic!("pressure profile should manage a backend");
        };

        assert_eq!(commands.start.name, "candidate_backend_start");
        assert!(!commands.start.command.iter().any(|arg| arg == "--force"));
        assert!(commands.start.command.iter().any(|arg| arg == "--locked"));
        assert!(commands.start.command.iter().any(|arg| arg == "--daemon"));
        assert!(
            commands
                .start
                .command
                .windows(2)
                .any(|args| args == ["--port", "8123"])
        );
        assert_eq!(commands.stop.name, "candidate_backend_stop");
        assert!(!commands.stop.command.iter().any(|arg| arg == "--force"));
        assert!(commands.stop.command.iter().any(|arg| arg == "--locked"));
        assert!(
            commands
                .stop
                .command
                .windows(2)
                .any(|args| args == ["--port", "8123"])
        );
        for command in [&commands.start, &commands.stop, &commands.force_stop] {
            assert!(command.env.iter().any(|(key, value)| {
                key == "RELAY_TEAMS_CONFIG_DIR"
                    && value.ends_with("perf-history/candidate-backends/run-123")
            }));
        }
        assert!(
            commands
                .backend_log
                .ends_with("candidate-backends/run-123/log/backend.log")
        );
        let log_files = pressure_log_files(&cli, Some(&commands));
        assert!(log_files.iter().any(|path| path == &commands.backend_log));
        assert_eq!(commands.force_stop.name, "candidate_backend_force_stop");
        assert!(
            commands
                .force_stop
                .command
                .iter()
                .any(|arg| arg == "--locked")
        );
        assert!(
            commands
                .force_stop
                .command
                .iter()
                .any(|arg| arg == "--force")
        );
        assert!(
            commands
                .force_stop
                .command
                .windows(2)
                .any(|args| args == ["--port", "8123"])
        );
    }

    #[test]
    fn candidate_backend_rejects_non_loopback_urls() {
        let mut cli = test_cli(std::path::PathBuf::from("."));
        cli.base_url = "http://benchmark.example.test:8123".to_owned();
        let paths = test_history_paths(std::path::PathBuf::from("/tmp/perf-history"));

        assert!(candidate_backend_commands(&cli, &paths, "run-123").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn prepare_candidate_backend_force_cleans_after_start_failure() {
        let workspace = initialized_worktree("relay-teams-start-cleanup");
        let cleanup_marker = workspace.join("cleanup-ran");
        let commands = CandidateBackendCommands {
            start: command::CommandSpec::new(
                "candidate_backend_start",
                vec!["sh".to_owned(), "-c".to_owned(), "exit 7".to_owned()],
                &workspace,
                1,
            ),
            stop: command::CommandSpec::new(
                "candidate_backend_stop",
                vec!["sh".to_owned(), "-c".to_owned(), "exit 0".to_owned()],
                &workspace,
                1,
            ),
            force_stop: command::CommandSpec::new(
                "candidate_backend_force_stop",
                vec![
                    "sh".to_owned(),
                    "-c".to_owned(),
                    format!("touch {}", cleanup_marker.display()),
                ],
                &workspace,
                1,
            ),
            host: "127.0.0.1".to_owned(),
            port: 9,
            backend_log: workspace.join("backend.log"),
        };

        let error = prepare_candidate_backend(&commands, 1).unwrap_err();
        let cleanup_ran = cleanup_marker.exists();
        let _ = fs::remove_dir_all(&workspace);

        assert!(error.contains("forced cleanup completed"));
        assert!(cleanup_ran);
    }

    #[cfg(unix)]
    #[test]
    fn prepare_candidate_backend_does_not_call_pre_start_stop() {
        let workspace = initialized_worktree("relay-teams-stop-cleanup");
        let stop_marker = workspace.join("stop-ran");
        let cleanup_marker = workspace.join("cleanup-ran");
        let commands = CandidateBackendCommands {
            start: command::CommandSpec::new(
                "candidate_backend_start",
                vec!["sh".to_owned(), "-c".to_owned(), "exit 0".to_owned()],
                &workspace,
                1,
            ),
            stop: command::CommandSpec::new(
                "candidate_backend_stop",
                vec![
                    "sh".to_owned(),
                    "-c".to_owned(),
                    format!("touch {}; exit 7", stop_marker.display()),
                ],
                &workspace,
                1,
            ),
            force_stop: command::CommandSpec::new(
                "candidate_backend_force_stop",
                vec![
                    "sh".to_owned(),
                    "-c".to_owned(),
                    format!("touch {}", cleanup_marker.display()),
                ],
                &workspace,
                1,
            ),
            host: "127.0.0.1".to_owned(),
            port: 9,
            backend_log: workspace.join("backend.log"),
        };

        prepare_candidate_backend(&commands, 1).unwrap();
        let stop_ran = stop_marker.exists();
        let cleanup_ran = cleanup_marker.exists();
        let _ = fs::remove_dir_all(&workspace);

        assert!(!stop_ran);
        assert!(!cleanup_ran);
    }

    #[cfg(unix)]
    #[test]
    fn prepare_candidate_backend_rejects_occupied_port_without_cleanup() {
        let workspace = initialized_worktree("relay-teams-port-cleanup");
        let start_marker = workspace.join("start-ran");
        let cleanup_marker = workspace.join("cleanup-ran");
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let commands = CandidateBackendCommands {
            start: command::CommandSpec::new(
                "candidate_backend_start",
                vec![
                    "sh".to_owned(),
                    "-c".to_owned(),
                    format!("touch {}", start_marker.display()),
                ],
                &workspace,
                1,
            ),
            stop: command::CommandSpec::new(
                "candidate_backend_stop",
                vec!["sh".to_owned(), "-c".to_owned(), "exit 0".to_owned()],
                &workspace,
                1,
            ),
            force_stop: command::CommandSpec::new(
                "candidate_backend_force_stop",
                vec![
                    "sh".to_owned(),
                    "-c".to_owned(),
                    format!("touch {}", cleanup_marker.display()),
                ],
                &workspace,
                1,
            ),
            host: "127.0.0.1".to_owned(),
            port,
            backend_log: workspace.join("backend.log"),
        };

        let error = prepare_candidate_backend(&commands, 1).unwrap_err();
        let start_ran = start_marker.exists();
        let cleanup_ran = cleanup_marker.exists();
        drop(listener);
        let _ = fs::remove_dir_all(&workspace);

        assert!(error.contains("already occupied"));
        assert!(!start_ran);
        assert!(!cleanup_ran);
    }

    #[cfg(unix)]
    #[test]
    fn stop_candidate_backend_force_cleans_after_port_timeout() {
        let workspace = initialized_worktree("relay-teams-stop-port-cleanup");
        let cleanup_marker = workspace.join("cleanup-ran");
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let commands = CandidateBackendCommands {
            start: command::CommandSpec::new(
                "candidate_backend_start",
                vec!["sh".to_owned(), "-c".to_owned(), "exit 0".to_owned()],
                &workspace,
                1,
            ),
            stop: command::CommandSpec::new(
                "candidate_backend_stop",
                vec!["sh".to_owned(), "-c".to_owned(), "exit 0".to_owned()],
                &workspace,
                1,
            ),
            force_stop: command::CommandSpec::new(
                "candidate_backend_force_stop",
                vec![
                    "sh".to_owned(),
                    "-c".to_owned(),
                    format!("touch {}", cleanup_marker.display()),
                ],
                &workspace,
                1,
            ),
            host: "127.0.0.1".to_owned(),
            port,
            backend_log: workspace.join("backend.log"),
        };

        let error = stop_candidate_backend(&commands).unwrap_err();
        let cleanup_ran = cleanup_marker.exists();
        drop(listener);
        let _ = fs::remove_dir_all(&workspace);

        assert!(error.contains("did not release"));
        assert!(error.contains("forced cleanup completed"));
        assert!(cleanup_ran);
    }
}
