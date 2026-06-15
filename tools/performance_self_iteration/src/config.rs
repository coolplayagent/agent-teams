use std::path::PathBuf;

use clap::{Parser, ValueEnum};

use crate::{command::CommandSpec, pressure::PressureConfig};

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub enum Mode {
    Loop,
    Once,
    Evaluate,
    Chart,
}

#[derive(Debug, Clone, Parser)]
#[command(name = "relay-teams-performance-iterate")]
pub struct Cli {
    #[arg(value_enum, default_value_t = Mode::Loop)]
    pub mode: Mode,
    #[arg(long, default_value = ".")]
    pub workspace: PathBuf,
    #[arg(long, default_value = "pressure-fast")]
    pub profile: String,
    #[arg(long, default_value = "http://127.0.0.1:8000")]
    pub base_url: String,
    #[arg(long, default_value_t = 100)]
    pub concurrency: usize,
    #[arg(long, default_value_t = 120)]
    pub duration_seconds: u64,
    #[arg(long, default_value_t = 20)]
    pub sessions: usize,
    #[arg(long, default_value_t = 30)]
    pub request_timeout_seconds: u64,
    #[arg(long)]
    pub log_files: Vec<PathBuf>,
    #[arg(long)]
    pub max_iterations: Option<usize>,
    #[arg(long)]
    pub stop_after_accepted: Option<usize>,
    #[arg(long, default_value_t = 5)]
    pub sleep_seconds: u64,
    #[arg(long, default_value_t = true)]
    pub yolo: bool,
    #[arg(long)]
    pub no_yolo: bool,
    #[arg(long)]
    pub dry_run_codex: bool,
    #[arg(long)]
    pub use_current_candidate: bool,
    #[arg(long)]
    pub fail_fast: bool,
    #[arg(long)]
    pub commit_accepted: bool,
    #[arg(long)]
    pub commit_message: Option<String>,
    #[arg(long, default_value = "codex")]
    pub codex_path: String,
    #[arg(long, default_value = "gpt-5.5")]
    pub model: String,
    #[arg(long, default_value = "xhigh")]
    pub codex_reasoning_effort: String,
    #[arg(long)]
    pub codex_profile: Option<String>,
    #[arg(long, default_value_t = 3600)]
    pub codex_timeout_seconds: u64,
    #[arg(long, default_value_t = 900)]
    pub command_timeout_seconds: u64,
}

impl Cli {
    pub fn parse_args() -> Self {
        Self::parse()
    }

    pub fn effective_yolo(&self) -> bool {
        self.yolo && !self.no_yolo
    }

    pub fn validate_profile(&self) -> Result<(), String> {
        match self.profile.as_str() {
            "smoke" | "pressure-fast" | "pressure-full" => Ok(()),
            profile => Err(format!(
                "unknown pressure profile {profile}; expected smoke, pressure-fast, or pressure-full"
            )),
        }
    }

    pub fn pressure_config(&self) -> PressureConfig {
        let (concurrency, duration_seconds, sessions) = match self.profile.as_str() {
            "smoke" => (4, 5, 2),
            "pressure-fast" => (self.concurrency, self.duration_seconds, self.sessions),
            "pressure-full" => (
                self.concurrency.max(100),
                self.duration_seconds.max(300),
                self.sessions.max(24),
            ),
            _ => unreachable!("profile is validated before pressure_config"),
        };
        PressureConfig {
            base_url: self.base_url.trim_end_matches('/').to_owned(),
            concurrency: concurrency.max(1),
            duration_seconds: duration_seconds.max(1),
            sessions: sessions.max(1),
            request_timeout_seconds: self.request_timeout_seconds.max(1),
        }
    }

    pub fn quality_gates(&self) -> Vec<CommandSpec> {
        let rust_gate = CommandSpec::new(
            "rust_harness_tests",
            vec![
                "cargo".to_owned(),
                "test".to_owned(),
                "--locked".to_owned(),
                "--manifest-path".to_owned(),
                "tools/performance_self_iteration/Cargo.toml".to_owned(),
            ],
            &self.workspace,
            self.command_timeout_seconds,
        );
        if self.profile == "smoke" {
            return vec![rust_gate];
        }
        vec![
            rust_gate,
            CommandSpec::new(
                "ruff_check",
                vec![
                    "uv".to_owned(),
                    "run".to_owned(),
                    "--locked".to_owned(),
                    "--extra".to_owned(),
                    "dev".to_owned(),
                    "ruff".to_owned(),
                    "check".to_owned(),
                ],
                &self.workspace,
                self.command_timeout_seconds,
            ),
            CommandSpec::new(
                "ruff_format",
                vec![
                    "uv".to_owned(),
                    "run".to_owned(),
                    "--locked".to_owned(),
                    "--extra".to_owned(),
                    "dev".to_owned(),
                    "ruff".to_owned(),
                    "format".to_owned(),
                    "--check".to_owned(),
                    "--no-cache".to_owned(),
                    "--force-exclude".to_owned(),
                ],
                &self.workspace,
                self.command_timeout_seconds,
            ),
            CommandSpec::new(
                "basedpyright",
                vec![
                    "uv".to_owned(),
                    "run".to_owned(),
                    "--locked".to_owned(),
                    "--extra".to_owned(),
                    "dev".to_owned(),
                    "basedpyright".to_owned(),
                ],
                &self.workspace,
                self.command_timeout_seconds,
            ),
            CommandSpec::new(
                "pytest_unit",
                vec![
                    "uv".to_owned(),
                    "run".to_owned(),
                    "--locked".to_owned(),
                    "--extra".to_owned(),
                    "dev".to_owned(),
                    "pytest".to_owned(),
                    "-q".to_owned(),
                    "tests/unit_tests".to_owned(),
                ],
                &self.workspace,
                self.command_timeout_seconds,
            ),
            CommandSpec::new(
                "pytest_integration",
                vec![
                    "uv".to_owned(),
                    "run".to_owned(),
                    "--locked".to_owned(),
                    "--extra".to_owned(),
                    "dev".to_owned(),
                    "pytest".to_owned(),
                    "-q".to_owned(),
                    "tests/integration_tests".to_owned(),
                ],
                &self.workspace,
                self.command_timeout_seconds,
            ),
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pressure_full_raises_defaults() {
        let cli = Cli {
            mode: Mode::Evaluate,
            workspace: PathBuf::from("."),
            profile: "pressure-full".to_owned(),
            base_url: "http://127.0.0.1:8000/".to_owned(),
            concurrency: 8,
            duration_seconds: 10,
            sessions: 2,
            request_timeout_seconds: 0,
            log_files: Vec::new(),
            max_iterations: None,
            stop_after_accepted: None,
            sleep_seconds: 5,
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
        let cfg = cli.pressure_config();
        assert_eq!(cfg.concurrency, 100);
        assert_eq!(cfg.duration_seconds, 300);
        assert_eq!(cfg.sessions, 24);
        assert_eq!(cfg.base_url, "http://127.0.0.1:8000");
    }

    #[test]
    fn unknown_profiles_are_rejected() {
        let cli = Cli {
            mode: Mode::Evaluate,
            workspace: PathBuf::from("."),
            profile: "pressure-fll".to_owned(),
            base_url: "http://127.0.0.1:8000".to_owned(),
            concurrency: 1,
            duration_seconds: 1,
            sessions: 1,
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

        assert!(
            cli.validate_profile()
                .unwrap_err()
                .contains("unknown pressure profile")
        );
    }

    #[test]
    fn non_smoke_profiles_include_rust_harness_gate() {
        let cli = Cli {
            mode: Mode::Evaluate,
            workspace: PathBuf::from("."),
            profile: "pressure-fast".to_owned(),
            base_url: "http://127.0.0.1:8000".to_owned(),
            concurrency: 1,
            duration_seconds: 1,
            sessions: 1,
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

        let gates = cli.quality_gates();

        assert!(gates.iter().any(|gate| gate.name == "rust_harness_tests"));
        let rust_gate = gates
            .iter()
            .find(|gate| gate.name == "rust_harness_tests")
            .unwrap();
        assert!(rust_gate.command.iter().any(|arg| arg == "--locked"));
        for gate in gates
            .iter()
            .filter(|gate| gate.command.first().is_some_and(|program| program == "uv"))
        {
            assert!(gate.command.iter().any(|arg| arg == "--locked"));
        }
        assert!(gates.iter().any(|gate| gate.name == "ruff_check"));
        assert!(gates.iter().any(|gate| gate.name == "ruff_format"));
        assert!(gates.iter().any(|gate| gate.name == "basedpyright"));
        assert!(gates.iter().any(|gate| gate.name == "pytest_unit"));
        assert!(gates.iter().any(|gate| gate.name == "pytest_integration"));
    }

    #[test]
    fn yolo_is_effective_by_default() {
        let cli = Cli::try_parse_from(["relay-teams-performance-iterate"]).unwrap();

        assert!(cli.effective_yolo());
    }

    #[test]
    fn no_yolo_disables_effective_yolo() {
        let cli = Cli::try_parse_from(["relay-teams-performance-iterate", "--no-yolo"]).unwrap();

        assert!(!cli.effective_yolo());
    }
}
