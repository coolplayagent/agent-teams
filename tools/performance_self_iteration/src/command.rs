use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    thread::JoinHandle,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};

#[cfg(unix)]
use std::os::unix::process::CommandExt;

const MAX_CAPTURED_OUTPUT_BYTES: usize = 128 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResult {
    pub name: String,
    pub command: Vec<String>,
    pub exit_code: i32,
    pub duration_ms: u64,
    pub stdout: String,
    pub stderr: String,
}

impl CommandResult {
    pub fn passed(&self) -> bool {
        self.exit_code == 0
    }

    pub fn gate_message(&self) -> String {
        last_output_line(&self.stdout, &self.stderr)
    }
}

#[derive(Debug, Clone)]
pub struct CommandSpec {
    pub name: String,
    pub command: Vec<String>,
    pub cwd: PathBuf,
    pub timeout_seconds: u64,
    pub stdin: Option<String>,
    pub env: Vec<(String, String)>,
}

impl CommandSpec {
    pub fn new(name: &str, command: Vec<String>, cwd: &Path, timeout_seconds: u64) -> Self {
        Self {
            name: name.to_owned(),
            command,
            cwd: cwd.to_path_buf(),
            timeout_seconds,
            stdin: None,
            env: Vec::new(),
        }
    }

    pub fn with_stdin(mut self, stdin: String) -> Self {
        self.stdin = Some(stdin);
        self
    }

    pub fn with_env(mut self, key: &str, value: String) -> Self {
        self.env.push((key.to_owned(), value));
        self
    }
}

pub fn run_command(spec: &CommandSpec) -> CommandResult {
    let started = Instant::now();
    let Some(program) = spec.command.first() else {
        return failed(spec, started, "empty command");
    };
    eprintln!(
        "[perf-iterate] command start name={} program={} argc={} timeout_s={}",
        spec.name,
        program,
        spec.command.len(),
        spec.timeout_seconds
    );
    let mut command = Command::new(program);
    command
        .args(spec.command.iter().skip(1))
        .current_dir(&spec.cwd);
    for (key, value) in &spec.env {
        command.env(key, value);
    }
    command.stdin(if spec.stdin.is_some() {
        Stdio::piped()
    } else {
        Stdio::null()
    });
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    configure_process_tree(&mut command);
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => return failed(spec, started, &error.to_string()),
    };
    let mut stdout_handle = child.stdout.take().map(read_pipe);
    let mut stderr_handle = child.stderr.take().map(read_pipe);
    if let Some(stdin) = spec.stdin.as_ref() {
        if let Some(mut handle) = child.stdin.take() {
            let input = stdin.clone();
            thread::spawn(move || {
                let _ = handle.write_all(input.as_bytes());
            });
        }
    }
    let timeout = Duration::from_secs(spec.timeout_seconds.max(1));
    let mut next_heartbeat = Duration::from_secs(15);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                terminate_process_tree(&mut child);
                let _ = child.wait();
                let (stdout, stderr) = collect_outputs_with_timeout(
                    stdout_handle.take(),
                    stderr_handle.take(),
                    Duration::from_secs(2),
                );
                let result = CommandResult {
                    name: spec.name.clone(),
                    command: spec.command.clone(),
                    exit_code: status.code().unwrap_or(1),
                    duration_ms: started.elapsed().as_millis() as u64,
                    stdout,
                    stderr,
                };
                eprintln!(
                    "[perf-iterate] command done name={} status={} exit={} duration_ms={}",
                    result.name,
                    if result.passed() { "ok" } else { "failed" },
                    result.exit_code,
                    result.duration_ms
                );
                return result;
            }
            Ok(None) if started.elapsed() >= timeout => {
                terminate_process_tree(&mut child);
                let _ = child.wait();
                let (stdout, mut stderr) = collect_outputs_with_timeout(
                    stdout_handle.take(),
                    stderr_handle.take(),
                    Duration::from_secs(2),
                );
                if !stderr.is_empty() {
                    stderr.push('\n');
                }
                stderr.push_str(&format!("timeout after {}s", spec.timeout_seconds));
                let result = CommandResult {
                    name: spec.name.clone(),
                    command: spec.command.clone(),
                    exit_code: 124,
                    duration_ms: started.elapsed().as_millis() as u64,
                    stdout,
                    stderr,
                };
                eprintln!(
                    "[perf-iterate] command timeout name={} duration_ms={}",
                    result.name, result.duration_ms
                );
                return result;
            }
            Ok(None) => {
                if started.elapsed() >= next_heartbeat {
                    eprintln!(
                        "[perf-iterate] command running name={} elapsed_s={} timeout_s={}",
                        spec.name,
                        started.elapsed().as_secs(),
                        spec.timeout_seconds
                    );
                    next_heartbeat += Duration::from_secs(15);
                }
                thread::sleep(Duration::from_millis(20));
            }
            Err(error) => return failed(spec, started, &error.to_string()),
        }
    }
}

fn configure_process_tree(command: &mut Command) {
    #[cfg(unix)]
    {
        command.process_group(0);
    }
}

fn terminate_process_tree(child: &mut std::process::Child) {
    #[cfg(unix)]
    {
        let process_group = format!("-{}", child.id());
        let _ = Command::new("kill")
            .args(["-TERM", "--", &process_group])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        thread::sleep(Duration::from_millis(200));
        if child.try_wait().ok().flatten().is_none() {
            let _ = Command::new("kill")
                .args(["-KILL", "--", &process_group])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
    }
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        thread::sleep(Duration::from_millis(200));
    }
    let _ = child.kill();
}

pub fn last_output_line(stdout: &str, stderr: &str) -> String {
    stderr
        .lines()
        .rev()
        .chain(stdout.lines().rev())
        .find(|line| !line.trim().is_empty())
        .unwrap_or("")
        .trim()
        .chars()
        .take(400)
        .collect()
}

fn failed(spec: &CommandSpec, started: Instant, message: &str) -> CommandResult {
    CommandResult {
        name: spec.name.clone(),
        command: spec.command.clone(),
        exit_code: 1,
        duration_ms: started.elapsed().as_millis() as u64,
        stdout: String::new(),
        stderr: message.to_owned(),
    }
}

fn read_pipe<R>(mut pipe: R) -> JoinHandle<String>
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        let mut output = Vec::new();
        let mut truncated = false;
        let mut chunk = [0_u8; 8192];
        loop {
            let Ok(count) = pipe.read(&mut chunk) else {
                break;
            };
            if count == 0 {
                break;
            }
            append_bounded_tail(&mut output, &chunk[..count], &mut truncated);
        }
        let text = String::from_utf8_lossy(&output);
        if truncated {
            format!("[output truncated to last {MAX_CAPTURED_OUTPUT_BYTES} bytes]\n{text}")
        } else {
            text.into_owned()
        }
    })
}

fn append_bounded_tail(output: &mut Vec<u8>, chunk: &[u8], truncated: &mut bool) {
    if chunk.len() >= MAX_CAPTURED_OUTPUT_BYTES {
        output.clear();
        output.extend_from_slice(&chunk[chunk.len() - MAX_CAPTURED_OUTPUT_BYTES..]);
        *truncated = true;
        return;
    }
    let overflow = output
        .len()
        .saturating_add(chunk.len())
        .saturating_sub(MAX_CAPTURED_OUTPUT_BYTES);
    if overflow > 0 {
        output.drain(0..overflow);
        *truncated = true;
    }
    output.extend_from_slice(chunk);
}

fn collect_outputs(
    stdout_handle: Option<JoinHandle<String>>,
    stderr_handle: Option<JoinHandle<String>>,
) -> (String, String) {
    let stdout = stdout_handle
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default();
    let stderr = stderr_handle
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default();
    (stdout, stderr)
}

fn collect_outputs_with_timeout(
    stdout_handle: Option<JoinHandle<String>>,
    stderr_handle: Option<JoinHandle<String>>,
    timeout: Duration,
) -> (String, String) {
    let started = Instant::now();
    let mut stdout_handle = stdout_handle;
    let mut stderr_handle = stderr_handle;
    while started.elapsed() < timeout {
        if stdout_handle.as_ref().is_none_or(JoinHandle::is_finished)
            && stderr_handle.as_ref().is_none_or(JoinHandle::is_finished)
        {
            return collect_outputs(stdout_handle.take(), stderr_handle.take());
        }
        thread::sleep(Duration::from_millis(20));
    }
    let stdout = if stdout_handle.as_ref().is_some_and(JoinHandle::is_finished) {
        stdout_handle
            .take()
            .and_then(|handle| handle.join().ok())
            .unwrap_or_default()
    } else {
        String::new()
    };
    let stderr = if stderr_handle.as_ref().is_some_and(JoinHandle::is_finished) {
        stderr_handle
            .take()
            .and_then(|handle| handle.join().ok())
            .unwrap_or_default()
    } else {
        "timeout output collection incomplete".to_owned()
    };
    (stdout, stderr)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_command_drains_verbose_output() {
        let spec = CommandSpec::new(
            "verbose",
            vec![
                "sh".to_owned(),
                "-c".to_owned(),
                "yes x | head -c 200000".to_owned(),
            ],
            Path::new("."),
            5,
        );

        let result = run_command(&spec);

        assert_eq!(result.exit_code, 0);
        assert!(result.stdout.len() < 140_000);
        assert!(result.stdout.contains("output truncated"));
        assert!(result.stdout.ends_with('x') || result.stdout.ends_with('\n'));
    }

    #[test]
    fn run_command_timeout_kills_child_process_tree() {
        let spec = CommandSpec::new(
            "timeout-tree",
            vec![
                "sh".to_owned(),
                "-c".to_owned(),
                "sh -c 'sleep 30' & wait".to_owned(),
            ],
            Path::new("."),
            1,
        );
        let started = Instant::now();

        let result = run_command(&spec);

        assert_eq!(result.exit_code, 124);
        assert!(started.elapsed() < Duration::from_secs(5));
        assert!(result.stderr.contains("timeout after 1s"));
    }

    #[test]
    fn run_command_bounds_output_after_parent_exits() {
        let spec = CommandSpec::new(
            "detached-output",
            vec![
                "sh".to_owned(),
                "-c".to_owned(),
                "sh -c 'sleep 30' &".to_owned(),
            ],
            Path::new("."),
            5,
        );
        let started = Instant::now();

        let result = run_command(&spec);

        assert_eq!(result.exit_code, 0);
        assert!(started.elapsed() < Duration::from_secs(5));
    }
}
