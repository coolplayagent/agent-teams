use std::{
    collections::BTreeMap,
    fs,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::UNIX_EPOCH,
};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::history::HistoryPaths;

const MAX_CAPTURED_PATCH_BYTES: usize = 16 * 1024 * 1024;
const MAX_GIT_ERROR_BYTES: usize = 64 * 1024;
#[cfg(not(test))]
const MAX_UNTRACKED_LIST_BYTES: usize = 4 * 1024 * 1024;
#[cfg(test)]
const MAX_UNTRACKED_LIST_BYTES: usize = 1024;
const MAX_IGNORED_SNAPSHOT_FILE_BYTES: u64 = 1024 * 1024;
const MAX_IGNORED_SNAPSHOT_TOTAL_BYTES: u64 = 8 * 1024 * 1024;
const MAX_GIT_METADATA_FILE_BYTES: u64 = 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
pub struct PatchSnapshot {
    pub path: PathBuf,
    pub has_diff: bool,
    pub sha256: String,
    pub bytes: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HeadState {
    pub commit: String,
    pub branch: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct IgnoredOutputFingerprint {
    len: u64,
    modified_ns: Option<u128>,
}

#[derive(Debug, Clone)]
struct IgnoredOutputEntry {
    fingerprint: IgnoredOutputFingerprint,
    contents: Option<Vec<u8>>,
    symlink_target: Option<PathBuf>,
    removable_if_changed: bool,
    filter_only: bool,
}

#[derive(Debug, Clone)]
pub struct IgnoredOutputSnapshot {
    entries: BTreeMap<String, IgnoredOutputEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitMetadataSnapshot {
    git_dir: PathBuf,
    entries: BTreeMap<PathBuf, GitMetadataEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GitMetadataEntry {
    kind: GitMetadataEntryKind,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum GitMetadataEntryKind {
    Directory,
    File {
        contents: Vec<u8>,
        mode: Option<u32>,
    },
    OversizedFile {
        len: u64,
    },
    Symlink {
        target: PathBuf,
    },
}

impl IgnoredOutputSnapshot {
    pub fn capture(workspace: &Path) -> Result<Self, String> {
        Ok(Self {
            entries: ignored_output_entries(workspace)?,
        })
    }

    fn contains_path_or_parent(&self, path: &str) -> bool {
        self.entries.contains_key(path) || self.has_filter_only_parent(path)
    }

    fn has_filter_only_parent(&self, path: &str) -> bool {
        let mut current = Path::new(path).parent().map(Path::to_path_buf);
        while let Some(parent) = current {
            let parent_text = parent.to_string_lossy();
            if parent_text.is_empty() {
                return false;
            }
            if self
                .entries
                .get(parent_text.as_ref())
                .is_some_and(|entry| entry.filter_only)
            {
                return true;
            }
            current = parent.parent().map(Path::to_path_buf);
        }
        false
    }
}

impl GitMetadataSnapshot {
    pub fn capture(workspace: &Path) -> Result<Self, String> {
        let git_dir = absolute_git_dir(workspace)?;
        Ok(Self {
            entries: git_metadata_entries(&git_dir)?,
            git_dir,
        })
    }

    pub fn restore_if_changed(&self, _workspace: &Path) -> Result<Option<String>, String> {
        let current = GitMetadataSnapshot {
            git_dir: self.git_dir.clone(),
            entries: git_metadata_entries(&self.git_dir)?,
        };
        if current.entries == self.entries {
            return Ok(None);
        }
        self.restore(&current).map_err(|error| {
            format!("candidate changed protected Git metadata and restore failed: {error}")
        })?;
        Ok(Some(
            "candidate changed protected Git metadata and was rejected".to_owned(),
        ))
    }

    fn restore(&self, current: &GitMetadataSnapshot) -> Result<(), String> {
        for relative_path in current.entries.keys().rev() {
            if self.entries.get(relative_path) != current.entries.get(relative_path) {
                remove_git_metadata_path(&self.git_dir.join(relative_path))?;
            }
        }
        for (relative_path, entry) in &self.entries {
            if current.entries.get(relative_path) != Some(entry) {
                restore_git_metadata_entry(&self.git_dir, relative_path, entry)?;
            }
        }
        Ok(())
    }
}

impl PatchSnapshot {
    pub fn serializable(&self) -> serde_json::Value {
        serde_json::json!({
            "path": self.path.display().to_string(),
            "has_diff": self.has_diff,
            "sha256": self.sha256,
            "bytes": self.bytes,
        })
    }
}

pub fn ensure_clean_worktree(workspace: &Path) -> Result<(), String> {
    let output = run_git(workspace, &["status", "--porcelain"])?;
    if output.trim().is_empty() {
        return Ok(());
    }
    Err(
        "working tree is dirty; use --use-current-candidate to evaluate existing changes"
            .to_owned(),
    )
}

pub fn worktree_changes_ignore_rules(workspace: &Path, base_ref: &str) -> Result<bool, String> {
    let output = Command::new("git")
        .args(["diff", "--name-status", "-z", base_ref])
        .current_dir(workspace)
        .output()
        .map_err(|error| format!("failed to inspect ignore-rule changes: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
    }
    if name_status_touches_ignore_rule(&output.stdout) {
        return Ok(true);
    }
    let output = Command::new("git")
        .args([
            "ls-files",
            "--others",
            "--exclude-standard",
            "-z",
            "--",
            ".gitignore",
            ":(glob)**/.gitignore",
        ])
        .current_dir(workspace)
        .output()
        .map_err(|error| format!("failed to inspect untracked ignore-rule changes: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .split('\0')
        .filter(|path| !path.is_empty())
        .any(is_ignore_rule_path))
}

fn name_status_touches_ignore_rule(output: &[u8]) -> bool {
    let text = String::from_utf8_lossy(output);
    let mut fields = text.split('\0').filter(|field| !field.is_empty());
    while let Some(status) = fields.next() {
        let Some(path) = fields.next() else {
            return false;
        };
        if is_ignore_rule_path(path) {
            return true;
        }
        if status.starts_with('R') || status.starts_with('C') {
            let Some(new_path) = fields.next() else {
                return false;
            };
            if is_ignore_rule_path(new_path) {
                return true;
            }
        }
    }
    false
}

pub fn git_info_exclude_is_modified(workspace: &Path, _base_ref: &str) -> Result<bool, String> {
    let exclude_path = git_path(workspace, "info/exclude")?;
    let metadata = match fs::symlink_metadata(&exclude_path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(true),
        Err(error) => {
            return Err(format!(
                "failed to inspect Git exclude metadata {}: {error}",
                exclude_path.display()
            ));
        }
    };
    if metadata.file_type().is_symlink() {
        return Ok(true);
    }
    let contents = fs::read_to_string(&exclude_path).map_err(|error| {
        format!(
            "failed to read Git exclude metadata {}: {error}",
            exclude_path.display()
        )
    })?;
    if git_info_exclude_has_active_rules(&contents) {
        return Ok(true);
    }
    if contents == DEFAULT_GIT_INFO_EXCLUDE {
        return Ok(false);
    }
    Ok(true)
}

const DEFAULT_GIT_INFO_EXCLUDE: &str = "# git ls-files --others --exclude-from=.git/info/exclude\n\
# Lines that start with '#' are comments.\n\
# For a project mostly in C, the following would be a good set of\n\
# exclude patterns (uncomment them if you want to use them):\n\
# *.[oa]\n\
# *~\n";

fn git_info_exclude_has_active_rules(contents: &str) -> bool {
    contents
        .lines()
        .map(str::trim)
        .any(|line| !line.is_empty() && !line.starts_with('#'))
}

fn is_ignore_rule_path(path: &str) -> bool {
    path == ".gitignore" || path.ends_with("/.gitignore")
}

pub fn current_head(workspace: &Path) -> Result<String, String> {
    Ok(run_git(workspace, &["rev-parse", "HEAD"])?
        .trim()
        .to_owned())
}

pub fn capture_head_state(workspace: &Path) -> Result<HeadState, String> {
    let commit = current_head(workspace)?;
    let branch = Command::new("git")
        .args(["symbolic-ref", "--quiet", "--short", "HEAD"])
        .current_dir(workspace)
        .output()
        .map_err(|error| format!("failed to inspect current branch: {error}"))
        .map(|output| {
            if output.status.success() {
                Some(String::from_utf8_lossy(&output.stdout).trim().to_owned())
            } else {
                None
            }
        })?;
    Ok(HeadState { commit, branch })
}

fn absolute_git_dir(workspace: &Path) -> Result<PathBuf, String> {
    Ok(PathBuf::from(
        run_git(workspace, &["rev-parse", "--absolute-git-dir"])?.trim(),
    ))
}

fn git_path(workspace: &Path, path: &str) -> Result<PathBuf, String> {
    let output = run_git(workspace, &["rev-parse", "--git-path", path])?;
    let git_path = PathBuf::from(output.trim());
    if git_path.is_absolute() {
        Ok(git_path)
    } else {
        Ok(workspace.join(git_path))
    }
}

fn git_metadata_entries(git_dir: &Path) -> Result<BTreeMap<PathBuf, GitMetadataEntry>, String> {
    let mut entries = BTreeMap::new();
    for relative_path in [
        PathBuf::from("config"),
        PathBuf::from("info"),
        PathBuf::from("hooks"),
    ] {
        insert_git_metadata_entry(git_dir, &relative_path, &mut entries)?;
    }
    if is_real_dir(&git_dir.join("info")) {
        insert_git_metadata_entry(
            git_dir,
            &PathBuf::from("info").join("exclude"),
            &mut entries,
        )?;
    }
    let hooks_dir = git_dir.join("hooks");
    if !is_real_dir(&hooks_dir) {
        return Ok(entries);
    }
    match fs::read_dir(&hooks_dir) {
        Ok(children) => {
            for child in children {
                let child = child.map_err(|error| {
                    format!(
                        "failed to inspect Git hooks directory {}: {error}",
                        hooks_dir.display()
                    )
                })?;
                insert_git_metadata_entry(
                    git_dir,
                    &PathBuf::from("hooks").join(child.file_name()),
                    &mut entries,
                )?;
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(format!(
                "failed to inspect Git hooks directory {}: {error}",
                hooks_dir.display()
            ));
        }
    }
    Ok(entries)
}

fn is_real_dir(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|metadata| metadata.is_dir() && !metadata.file_type().is_symlink())
        .unwrap_or(false)
}

fn insert_git_metadata_entry(
    git_dir: &Path,
    relative_path: &Path,
    entries: &mut BTreeMap<PathBuf, GitMetadataEntry>,
) -> Result<(), String> {
    if let Some(entry) = git_metadata_entry(git_dir, relative_path)? {
        entries.insert(relative_path.to_path_buf(), entry);
    }
    Ok(())
}

fn git_metadata_entry(
    git_dir: &Path,
    relative_path: &Path,
) -> Result<Option<GitMetadataEntry>, String> {
    let path = git_dir.join(relative_path);
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(format!(
                "failed to inspect Git metadata {}: {error}",
                path.display()
            ));
        }
    };
    if metadata.file_type().is_symlink() {
        return Ok(Some(GitMetadataEntry {
            kind: GitMetadataEntryKind::Symlink {
                target: fs::read_link(&path).map_err(|error| {
                    format!(
                        "failed to read Git metadata symlink {}: {error}",
                        path.display()
                    )
                })?,
            },
        }));
    }
    if metadata.is_dir() {
        return Ok(Some(GitMetadataEntry {
            kind: GitMetadataEntryKind::Directory,
        }));
    }
    if metadata.is_file() {
        if metadata.len() > MAX_GIT_METADATA_FILE_BYTES {
            return Ok(Some(GitMetadataEntry {
                kind: GitMetadataEntryKind::OversizedFile {
                    len: metadata.len(),
                },
            }));
        }
        return Ok(Some(GitMetadataEntry {
            kind: GitMetadataEntryKind::File {
                contents: fs::read(&path).map_err(|error| {
                    format!("failed to read Git metadata {}: {error}", path.display())
                })?,
                mode: file_mode(&metadata),
            },
        }));
    }
    Ok(None)
}

fn restore_git_metadata_entry(
    git_dir: &Path,
    relative_path: &Path,
    entry: &GitMetadataEntry,
) -> Result<(), String> {
    ensure_git_metadata_parent_dirs(git_dir, relative_path)?;
    let path = git_dir.join(relative_path);
    match &entry.kind {
        GitMetadataEntryKind::Directory => {
            if let Ok(metadata) = fs::symlink_metadata(&path) {
                if metadata.is_dir() && !metadata.file_type().is_symlink() {
                    return Ok(());
                }
                remove_git_metadata_path(&path)?;
            }
            fs::create_dir(&path).map_err(|error| {
                format!(
                    "failed to restore Git metadata dir {}: {error}",
                    path.display()
                )
            })
        }
        GitMetadataEntryKind::File { contents, mode } => {
            if fs::symlink_metadata(&path).is_ok() {
                remove_git_metadata_path(&path)?;
            }
            fs::write(&path, contents).map_err(|error| {
                format!(
                    "failed to restore Git metadata file {}: {error}",
                    path.display()
                )
            })?;
            set_file_mode(&path, *mode)
        }
        GitMetadataEntryKind::OversizedFile { len } => Err(format!(
            "cannot restore oversized baseline Git metadata {} ({} bytes)",
            path.display(),
            len
        )),
        GitMetadataEntryKind::Symlink { target } => {
            if fs::symlink_metadata(&path).is_ok() {
                remove_git_metadata_path(&path)?;
            }
            create_symlink(target, &path)
        }
    }
}

fn ensure_git_metadata_parent_dirs(git_dir: &Path, relative_path: &Path) -> Result<(), String> {
    let Some(parent) = relative_path.parent() else {
        return Ok(());
    };
    let mut current = git_dir.to_path_buf();
    for component in parent.components() {
        let Component::Normal(name) = component else {
            return Err(format!(
                "Git metadata has unsafe path {}",
                relative_path.display()
            ));
        };
        current.push(name);
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
            Ok(_) => {
                remove_git_metadata_path(&current)?;
                fs::create_dir(&current).map_err(|error| {
                    format!(
                        "failed to restore Git metadata parent {}: {error}",
                        current.display()
                    )
                })?;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                fs::create_dir(&current).map_err(|create_error| {
                    format!(
                        "failed to restore Git metadata parent {}: {create_error}",
                        current.display()
                    )
                })?;
            }
            Err(error) => {
                return Err(format!(
                    "failed to inspect Git metadata parent {}: {error}",
                    current.display()
                ));
            }
        }
    }
    Ok(())
}

fn remove_git_metadata_path(path: &Path) -> Result<(), String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            return Err(format!(
                "failed to inspect Git metadata {}: {error}",
                path.display()
            ));
        }
    };
    if metadata.is_dir() && !metadata.file_type().is_symlink() {
        fs::remove_dir_all(path).map_err(|error| {
            format!(
                "failed to remove Git metadata dir {}: {error}",
                path.display()
            )
        })
    } else {
        fs::remove_file(path).map_err(|error| {
            format!(
                "failed to remove Git metadata file {}: {error}",
                path.display()
            )
        })
    }
}

#[cfg(unix)]
fn file_mode(metadata: &fs::Metadata) -> Option<u32> {
    Some(metadata.permissions().mode())
}

#[cfg(not(unix))]
fn file_mode(_metadata: &fs::Metadata) -> Option<u32> {
    None
}

#[cfg(unix)]
fn set_file_mode(path: &Path, mode: Option<u32>) -> Result<(), String> {
    if let Some(mode) = mode {
        let permissions = fs::Permissions::from_mode(mode);
        fs::set_permissions(path, permissions).map_err(|error| {
            format!(
                "failed to restore Git metadata mode {}: {error}",
                path.display()
            )
        })?;
    }
    Ok(())
}

#[cfg(not(unix))]
fn set_file_mode(_path: &Path, _mode: Option<u32>) -> Result<(), String> {
    Ok(())
}

pub fn capture_patch(
    workspace: &Path,
    paths: &HistoryPaths,
    run_id: &str,
    base_ref: &str,
    baseline_ignored: Option<&IgnoredOutputSnapshot>,
) -> Result<PatchSnapshot, String> {
    paths.ensure()?;
    if let Some(snapshot) = baseline_ignored {
        reject_staged_baseline_ignored(workspace, snapshot)?;
    }
    let untracked = candidate_patch_files(workspace, baseline_ignored)?;
    if !untracked.is_empty() {
        let mut args = vec!["add".to_owned(), "-N".to_owned(), "--".to_owned()];
        args.extend(untracked.iter().cloned());
        run_git_owned(workspace, &args)?;
    }
    let path = paths.patches.join(format!("{run_id}.patch"));
    let output = capture_git_diff(workspace, base_ref, &path);
    if !untracked.is_empty() {
        let mut args = vec!["reset".to_owned(), "--".to_owned()];
        args.extend(untracked.iter().cloned());
        run_git_owned(workspace, &args)?;
    }
    output
}

pub fn verify_patch_unchanged(
    workspace: &Path,
    paths: &HistoryPaths,
    run_id: &str,
    base_ref: &str,
    baseline_ignored: Option<&IgnoredOutputSnapshot>,
    expected: &PatchSnapshot,
) -> Result<(), String> {
    let check_run_id = format!("{run_id}-post-evaluation");
    let current = capture_patch(workspace, paths, &check_run_id, base_ref, baseline_ignored)?;
    let _ = fs::remove_file(&current.path);
    if current.has_diff == expected.has_diff
        && current.bytes == expected.bytes
        && current.sha256 == expected.sha256
    {
        Ok(())
    } else {
        Err(format!(
            "candidate worktree changed after evaluation; expected patch sha256={} bytes={}, current sha256={} bytes={}",
            expected.sha256, expected.bytes, current.sha256, current.bytes
        ))
    }
}

pub fn empty_patch_snapshot(paths: &HistoryPaths, run_id: &str) -> Result<PatchSnapshot, String> {
    paths.ensure()?;
    let path = paths.patches.join(format!("{run_id}.patch"));
    fs::write(&path, []).map_err(|error| format!("failed to write empty patch: {error}"))?;
    let hasher = Sha256::new();
    Ok(PatchSnapshot {
        path,
        has_diff: false,
        sha256: format!("{:x}", hasher.finalize()),
        bytes: 0,
    })
}

pub fn restore_worktree(workspace: &Path, base_ref: &str) -> Result<(), String> {
    run_git(workspace, &["reset", "--hard", base_ref])?;
    run_git(workspace, &["clean", "-ffd"])?;
    Ok(())
}

pub fn restore_worktree_state(workspace: &Path, base_state: &HeadState) -> Result<(), String> {
    restore_worktree(workspace, "HEAD")?;
    restore_head_state(workspace, base_state)?;
    restore_worktree(workspace, &base_state.commit)
}

pub fn restore_worktree_after_candidate(
    workspace: &Path,
    base_state: &HeadState,
    ignored_snapshot: &IgnoredOutputSnapshot,
) -> Result<(), String> {
    restore_worktree_state(workspace, base_state)?;
    reset_candidate_ignored_outputs(workspace, ignored_snapshot)
}

pub fn head_commit_touches_harness(workspace: &Path) -> Result<bool, String> {
    let output = run_git(
        workspace,
        &["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"],
    )?;
    Ok(output.lines().any(is_harness_path))
}

fn is_harness_path(path: &str) -> bool {
    path == "self-iterate-performance.sh" || path.starts_with("tools/performance_self_iteration/")
}

fn restore_head_state(workspace: &Path, base_state: &HeadState) -> Result<(), String> {
    match base_state.branch.as_deref() {
        Some(branch) => {
            if let Err(branch_error) = run_git(workspace, &["switch", branch]) {
                run_git(workspace, &["switch", "--detach", &base_state.commit]).map_err(
                    |detach_error| {
                        format!(
                            "failed to restore branch {branch}: {branch_error}; \
                             failed to switch to saved commit: {detach_error}"
                        )
                    },
                )?;
            }
        }
        None => {
            run_git(workspace, &["switch", "--detach", &base_state.commit])?;
        }
    }
    Ok(())
}

pub fn commit_candidate(
    workspace: &Path,
    message: Option<&str>,
    score: f64,
    baseline_ignored: Option<&IgnoredOutputSnapshot>,
) -> Result<String, String> {
    if let Some(snapshot) = baseline_ignored {
        reject_staged_baseline_ignored(workspace, snapshot)?;
    }
    let staged_patch = staged_patch(workspace)?;
    let subject = message
        .map(str::to_owned)
        .unwrap_or_else(|| format!("Improve high-concurrency performance ({score:.4})"));
    let result = stage_candidate_changes(workspace, baseline_ignored)
        .and_then(|_| run_git(workspace, &["commit", "-m", &subject]))
        .and_then(|_| current_head(workspace));
    match result {
        Ok(commit) => Ok(commit),
        Err(error) => {
            restore_index(workspace, &staged_patch).map_err(|restore_error| {
                format!("{error}; failed to restore index: {restore_error}")
            })?;
            Err(error)
        }
    }
}

pub fn restore_ignored_outputs(
    workspace: &Path,
    snapshot: &IgnoredOutputSnapshot,
) -> Result<(), String> {
    reset_candidate_ignored_outputs(workspace, snapshot)
}

fn stage_candidate_changes(
    workspace: &Path,
    baseline_ignored: Option<&IgnoredOutputSnapshot>,
) -> Result<(), String> {
    run_git(workspace, &["add", "-u"])?;
    let untracked = candidate_patch_files(workspace, baseline_ignored)?;
    if untracked.is_empty() {
        return Ok(());
    }
    let mut args = vec!["add".to_owned(), "--".to_owned()];
    args.extend(untracked);
    run_git_owned(workspace, &args)?;
    Ok(())
}

fn reject_staged_baseline_ignored(
    workspace: &Path,
    snapshot: &IgnoredOutputSnapshot,
) -> Result<(), String> {
    let paths = staged_baseline_ignored_paths(workspace, snapshot)?;
    if paths.is_empty() {
        return Ok(());
    }
    unstage_paths(workspace, &paths)?;
    Err(format!(
        "baseline ignored files were staged and cannot be captured: {}",
        paths.join(", ")
    ))
}

fn staged_baseline_ignored_paths(
    workspace: &Path,
    snapshot: &IgnoredOutputSnapshot,
) -> Result<Vec<String>, String> {
    let output = Command::new("git")
        .args(["diff", "--cached", "--name-only", "-z"])
        .current_dir(workspace)
        .output()
        .map_err(|error| format!("failed to inspect staged files: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .split('\0')
        .filter(|path| !path.is_empty())
        .filter(|path| snapshot.contains_path_or_parent(path))
        .map(str::to_owned)
        .collect())
}

fn unstage_paths(workspace: &Path, paths: &[String]) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut args = vec!["reset".to_owned(), "--".to_owned()];
    args.extend(paths.iter().cloned());
    run_git_owned(workspace, &args)?;
    Ok(())
}

fn staged_patch(workspace: &Path) -> Result<Vec<u8>, String> {
    let output = Command::new("git")
        .args(["diff", "--cached", "--binary"])
        .current_dir(workspace)
        .output()
        .map_err(|error| format!("failed to snapshot staged changes: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
    }
    Ok(output.stdout)
}

fn restore_index(workspace: &Path, staged_patch: &[u8]) -> Result<(), String> {
    run_git(workspace, &["reset"])?;
    if staged_patch.is_empty() {
        return Ok(());
    }
    run_git_with_stdin(
        workspace,
        &["apply", "--cached", "--binary", "--whitespace=nowarn"],
        staged_patch,
    )
}

fn run_git(workspace: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(workspace)
        .output()
        .map_err(|error| format!("failed to run git {}: {error}", args.join(" ")))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn run_git_with_stdin(workspace: &Path, args: &[&str], stdin: &[u8]) -> Result<(), String> {
    let mut child = Command::new("git")
        .args(args)
        .current_dir(workspace)
        .stdin(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to run git {}: {error}", args.join(" ")))?;
    if let Some(mut handle) = child.stdin.take() {
        handle
            .write_all(stdin)
            .map_err(|error| format!("failed to write git {} stdin: {error}", args.join(" ")))?;
    }
    let output = child
        .wait_with_output()
        .map_err(|error| format!("failed to wait for git {}: {error}", args.join(" ")))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
    }
    Ok(())
}

fn run_git_owned(workspace: &Path, args: &[String]) -> Result<String, String> {
    let refs = args.iter().map(String::as_str).collect::<Vec<_>>();
    run_git(workspace, &refs)
}

fn capture_git_diff(
    workspace: &Path,
    base_ref: &str,
    patch_path: &Path,
) -> Result<PatchSnapshot, String> {
    let mut child = Command::new("git")
        .args(["diff", "--binary", base_ref])
        .current_dir(workspace)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to run git diff: {error}"))?;
    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| "failed to capture git diff stdout".to_owned())?;
    let stderr_handle = child.stderr.take().map(|mut stderr| {
        thread::spawn(move || {
            let mut output = Vec::new();
            let mut buffer = [0_u8; 4096];
            while let Ok(count) = stderr.read(&mut buffer) {
                if count == 0 {
                    break;
                }
                append_bounded_bytes(&mut output, &buffer[..count], MAX_GIT_ERROR_BYTES);
            }
            String::from_utf8_lossy(&output).into_owned()
        })
    });
    let mut file =
        fs::File::create(patch_path).map_err(|error| format!("failed to write patch: {error}"))?;
    let mut hasher = Sha256::new();
    let mut bytes = 0usize;
    let mut buffer = [0_u8; 8192];
    loop {
        let count = stdout
            .read(&mut buffer)
            .map_err(|error| format!("failed to read git diff: {error}"))?;
        if count == 0 {
            break;
        }
        bytes = bytes.saturating_add(count);
        if bytes > MAX_CAPTURED_PATCH_BYTES {
            let _ = child.kill();
            let _ = child.wait();
            drop(file);
            let _ = fs::remove_file(patch_path);
            return Err(format!(
                "candidate patch exceeds {} bytes",
                MAX_CAPTURED_PATCH_BYTES
            ));
        }
        file.write_all(&buffer[..count])
            .map_err(|error| format!("failed to write patch: {error}"))?;
        hasher.update(&buffer[..count]);
    }
    drop(file);
    let status = child
        .wait()
        .map_err(|error| format!("failed to wait for git diff: {error}"))?;
    let stderr = stderr_handle
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default();
    if !status.success() {
        let _ = fs::remove_file(patch_path);
        return Err(stderr.trim().to_owned());
    }
    Ok(PatchSnapshot {
        path: patch_path.to_path_buf(),
        has_diff: bytes > 0,
        sha256: format!("{:x}", hasher.finalize()),
        bytes,
    })
}

fn append_bounded_bytes(output: &mut Vec<u8>, chunk: &[u8], max_bytes: usize) {
    if chunk.len() >= max_bytes {
        output.clear();
        output.extend_from_slice(&chunk[chunk.len() - max_bytes..]);
        return;
    }
    let overflow = output
        .len()
        .saturating_add(chunk.len())
        .saturating_sub(max_bytes);
    if overflow > 0 {
        output.drain(0..overflow);
    }
    output.extend_from_slice(chunk);
}

fn candidate_patch_files(
    workspace: &Path,
    baseline_ignored: Option<&IgnoredOutputSnapshot>,
) -> Result<Vec<String>, String> {
    let output = git_stdout_bounded(
        workspace,
        &["ls-files", "--others", "--exclude-standard", "-z"],
        MAX_UNTRACKED_LIST_BYTES,
        "untracked file list",
    )?;
    Ok(String::from_utf8_lossy(&output)
        .split('\0')
        .filter(|path| !path.is_empty())
        .filter(|path| !is_nested_git_output(workspace, path))
        .filter(|path| {
            baseline_ignored.is_none_or(|snapshot| !snapshot.contains_path_or_parent(path))
        })
        .map(str::to_owned)
        .collect())
}

fn git_stdout_bounded(
    workspace: &Path,
    args: &[&str],
    max_bytes: usize,
    description: &str,
) -> Result<Vec<u8>, String> {
    let mut child = Command::new("git")
        .args(args)
        .current_dir(workspace)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to run git {}: {error}", args.join(" ")))?;
    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| format!("failed to capture git {} stdout", args.join(" ")))?;
    let stderr_handle = child.stderr.take().map(|mut stderr| {
        thread::spawn(move || {
            let mut output = Vec::new();
            let mut buffer = [0_u8; 4096];
            while let Ok(count) = stderr.read(&mut buffer) {
                if count == 0 {
                    break;
                }
                append_bounded_bytes(&mut output, &buffer[..count], MAX_GIT_ERROR_BYTES);
            }
            String::from_utf8_lossy(&output).into_owned()
        })
    });
    let mut output = Vec::new();
    let mut buffer = [0_u8; 8192];
    loop {
        let count = stdout
            .read(&mut buffer)
            .map_err(|error| format!("failed to read git {} stdout: {error}", args.join(" ")))?;
        if count == 0 {
            break;
        }
        output.extend_from_slice(&buffer[..count]);
        if output.len() > max_bytes {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("{description} exceeds {max_bytes} bytes"));
        }
    }
    let status = child
        .wait()
        .map_err(|error| format!("failed to wait for git {}: {error}", args.join(" ")))?;
    let stderr = stderr_handle
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default();
    if !status.success() {
        return Err(stderr.trim().to_owned());
    }
    Ok(output)
}

fn is_nested_git_output(workspace: &Path, path: &str) -> bool {
    let candidate = workspace.join(path);
    candidate.join(".git").exists() || path.split('/').any(|component| component == ".git")
}

fn ignored_output_entries(
    workspace: &Path,
) -> Result<BTreeMap<String, IgnoredOutputEntry>, String> {
    let output = Command::new("git")
        .args([
            "ls-files",
            "--others",
            "--ignored",
            "--exclude-standard",
            "-z",
        ])
        .current_dir(workspace)
        .output()
        .map_err(|error| format!("failed to list ignored files: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
    }
    let mut entries = BTreeMap::new();
    let mut snapshot_bytes = 0_u64;
    for path in String::from_utf8_lossy(&output.stdout)
        .split('\0')
        .filter(|path| !path.is_empty())
    {
        let relative_path = normalize_ignored_path(path);
        insert_filter_only_ignored_parents(&relative_path, &mut entries);
        let absolute = workspace.join(&relative_path);
        let metadata = fs::symlink_metadata(&absolute).map_err(|error| {
            format!(
                "failed to inspect ignored output {}: {error}",
                absolute.display()
            )
        })?;
        if metadata.is_dir() && !metadata.file_type().is_symlink() {
            entries
                .entry(relative_path)
                .or_insert_with(|| filter_only_ignored_output_entry(&metadata));
        } else if is_ignored_output_entry_excluded(&relative_path) {
            entries
                .entry(relative_path)
                .or_insert_with(|| filter_only_ignored_output_entry(&metadata));
        } else if metadata.is_file() || metadata.file_type().is_symlink() {
            let entry = ignored_output_entry(
                &relative_path,
                &absolute,
                metadata,
                MAX_IGNORED_SNAPSHOT_TOTAL_BYTES.saturating_sub(snapshot_bytes),
            )?;
            if let Some(contents) = &entry.contents {
                snapshot_bytes = snapshot_bytes.saturating_add(contents.len() as u64);
            }
            entries.insert(relative_path, entry);
        }
    }
    Ok(entries)
}

fn normalize_ignored_path(relative_path: &str) -> String {
    relative_path.trim_end_matches('/').to_owned()
}

fn insert_filter_only_ignored_parents(
    relative_path: &str,
    entries: &mut BTreeMap<String, IgnoredOutputEntry>,
) {
    for parent in filter_only_ignored_parents(relative_path) {
        entries
            .entry(parent)
            .or_insert_with(filter_only_ignored_output_entry_without_metadata);
    }
}

fn filter_only_ignored_parents(relative_path: &str) -> Vec<String> {
    [
        ".venv/",
        ".pytest_cache/",
        ".mypy_cache/",
        ".ruff_cache/",
        "node_modules/",
        "frontend/node_modules/",
    ]
    .iter()
    .filter_map(|prefix| {
        relative_path
            .strip_prefix(prefix)
            .map(|_| prefix.trim_end_matches('/').to_owned())
    })
    .collect()
}

fn filter_only_ignored_output_entry(metadata: &fs::Metadata) -> IgnoredOutputEntry {
    let modified_ns = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos());
    IgnoredOutputEntry {
        fingerprint: IgnoredOutputFingerprint {
            len: metadata.len(),
            modified_ns,
        },
        contents: None,
        symlink_target: None,
        removable_if_changed: false,
        filter_only: true,
    }
}

fn filter_only_ignored_output_entry_without_metadata() -> IgnoredOutputEntry {
    IgnoredOutputEntry {
        fingerprint: IgnoredOutputFingerprint {
            len: 0,
            modified_ns: None,
        },
        contents: None,
        symlink_target: None,
        removable_if_changed: false,
        filter_only: true,
    }
}

fn is_ignored_output_entry_excluded(relative_path: &str) -> bool {
    relative_path.starts_with(".venv/")
        || relative_path.starts_with(".pytest_cache/")
        || relative_path.starts_with(".mypy_cache/")
        || relative_path.starts_with(".ruff_cache/")
        || relative_path.starts_with("node_modules/")
        || relative_path.starts_with("frontend/node_modules/")
}

fn ignored_output_entry(
    relative_path: &str,
    path: &Path,
    metadata: fs::Metadata,
    remaining_snapshot_bytes: u64,
) -> Result<IgnoredOutputEntry, String> {
    let modified_ns = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos());
    let fingerprint = IgnoredOutputFingerprint {
        len: metadata.len(),
        modified_ns,
    };
    let symlink_target = if metadata.file_type().is_symlink() {
        Some(fs::read_link(path).map_err(|error| {
            format!(
                "failed to snapshot ignored output symlink {}: {error}",
                path.display()
            )
        })?)
    } else {
        None
    };
    let contents =
        if should_snapshot_ignored_contents(relative_path, &metadata, remaining_snapshot_bytes) {
            Some(fs::read(path).map_err(|error| {
                format!(
                    "failed to snapshot ignored output {}: {error}",
                    path.display()
                )
            })?)
        } else {
            None
        };
    Ok(IgnoredOutputEntry {
        fingerprint,
        contents,
        symlink_target,
        removable_if_changed: is_removable_ignored_output(relative_path),
        filter_only: false,
    })
}

fn should_snapshot_ignored_contents(
    relative_path: &str,
    metadata: &fs::Metadata,
    remaining_snapshot_bytes: u64,
) -> bool {
    metadata.is_file()
        && metadata.len() <= MAX_IGNORED_SNAPSHOT_FILE_BYTES
        && metadata.len() <= remaining_snapshot_bytes
        && !is_ignored_content_snapshot_excluded(relative_path)
}

fn is_removable_ignored_output(relative_path: &str) -> bool {
    is_large_generated_ignored_output(relative_path)
}

fn is_ignored_content_snapshot_excluded(relative_path: &str) -> bool {
    is_ignored_output_entry_excluded(relative_path)
        || is_large_generated_ignored_output(relative_path)
        || relative_path.ends_with(".log")
}

fn is_large_generated_ignored_output(relative_path: &str) -> bool {
    relative_path.starts_with("target/")
        || relative_path.starts_with("tools/performance_self_iteration/target/")
}

fn reset_candidate_ignored_outputs(
    workspace: &Path,
    snapshot: &IgnoredOutputSnapshot,
) -> Result<(), String> {
    let current = ignored_output_entries(workspace)?;
    let mut remove_paths = Vec::new();
    let mut restore_paths = Vec::new();
    for (path, current_entry) in &current {
        let Some(snapshot_entry) = snapshot.entries.get(path) else {
            if snapshot.has_filter_only_parent(path) {
                continue;
            }
            remove_paths.push(path.clone());
            continue;
        };
        if !snapshot_entry.filter_only && ignored_output_changed(snapshot_entry, current_entry) {
            restore_paths.push(path.clone());
        }
    }
    for (path, snapshot_entry) in &snapshot.entries {
        if current.contains_key(path) {
            continue;
        }
        if snapshot_entry.filter_only || !ignored_path_is_currently_ignored(workspace, path)? {
            remove_paths.push(path.clone());
        } else {
            restore_paths.push(path.clone());
        }
    }
    for path in remove_paths {
        remove_ignored_output(workspace, &path)?;
    }
    for path in restore_paths {
        restore_ignored_output(workspace, &path, &snapshot.entries[&path])?;
    }
    Ok(())
}

fn ignored_path_is_currently_ignored(
    workspace: &Path,
    relative_path: &str,
) -> Result<bool, String> {
    let status = Command::new("git")
        .args(["check-ignore", "--quiet", "--", relative_path])
        .current_dir(workspace)
        .status()
        .map_err(|error| format!("failed to check ignored path {relative_path}: {error}"))?;
    Ok(status.success())
}

fn ignored_output_changed(
    snapshot_entry: &IgnoredOutputEntry,
    current_entry: &IgnoredOutputEntry,
) -> bool {
    if snapshot_entry.symlink_target.is_some() || current_entry.symlink_target.is_some() {
        return snapshot_entry.symlink_target != current_entry.symlink_target;
    }
    match (&snapshot_entry.contents, &current_entry.contents) {
        (Some(snapshot_contents), Some(current_contents)) => snapshot_contents != current_contents,
        _ => snapshot_entry.fingerprint != current_entry.fingerprint,
    }
}

fn restore_ignored_output(
    workspace: &Path,
    relative_path: &str,
    snapshot_entry: &IgnoredOutputEntry,
) -> Result<(), String> {
    if let Some(target) = &snapshot_entry.symlink_target {
        let path = workspace.join(relative_path);
        ensure_real_parent_dirs(workspace, relative_path)?;
        if fs::symlink_metadata(&path).is_ok() {
            remove_path_no_follow(&path)?;
        }
        return create_symlink(target, &path);
    }
    let Some(contents) = snapshot_entry.contents.as_ref() else {
        if snapshot_entry.removable_if_changed {
            return remove_ignored_output(workspace, relative_path);
        }
        return Err(format!(
            "ignored output {relative_path} changed but was not snapshotted"
        ));
    };
    let path = workspace.join(relative_path);
    ensure_real_parent_dirs(workspace, relative_path)?;
    if fs::symlink_metadata(&path).is_ok() {
        remove_path_no_follow(&path)?;
    }
    fs::write(&path, contents).map_err(|error| {
        format!(
            "failed to restore ignored output {}: {error}",
            path.display()
        )
    })
}

#[cfg(unix)]
fn create_symlink(target: &Path, path: &Path) -> Result<(), String> {
    std::os::unix::fs::symlink(target, path).map_err(|error| {
        format!(
            "failed to restore symlink {} -> {}: {error}",
            path.display(),
            target.display()
        )
    })
}

#[cfg(not(unix))]
fn create_symlink(_target: &Path, path: &Path) -> Result<(), String> {
    Err(format!(
        "failed to restore symlink {}; symlink restore is unsupported on this platform",
        path.display()
    ))
}

fn ensure_real_parent_dirs(workspace: &Path, relative_path: &str) -> Result<(), String> {
    let relative = Path::new(relative_path);
    let Some(parent) = relative.parent() else {
        return Ok(());
    };
    let mut current = workspace.to_path_buf();
    for component in parent.components() {
        let Component::Normal(name) = component else {
            return Err(format!("ignored output has unsafe path {relative_path}"));
        };
        current.push(name);
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
            Ok(metadata) => {
                if metadata.file_type().is_symlink() || metadata.is_file() {
                    fs::remove_file(&current).map_err(|error| {
                        format!(
                            "failed to remove ignored parent {}: {error}",
                            current.display()
                        )
                    })?;
                } else if metadata.is_dir() {
                    fs::remove_dir_all(&current).map_err(|error| {
                        format!(
                            "failed to remove ignored parent {}: {error}",
                            current.display()
                        )
                    })?;
                } else {
                    fs::remove_file(&current).map_err(|error| {
                        format!(
                            "failed to remove ignored parent {}: {error}",
                            current.display()
                        )
                    })?;
                }
                fs::create_dir(&current).map_err(|error| {
                    format!(
                        "failed to create ignored parent {}: {error}",
                        current.display()
                    )
                })?;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                fs::create_dir(&current).map_err(|create_error| {
                    format!(
                        "failed to create ignored parent {}: {create_error}",
                        current.display()
                    )
                })?;
            }
            Err(error) => {
                return Err(format!(
                    "failed to inspect ignored parent {}: {error}",
                    current.display()
                ));
            }
        }
    }
    Ok(())
}

fn remove_ignored_output(workspace: &Path, relative_path: &str) -> Result<(), String> {
    let path = workspace.join(relative_path);
    let Ok(metadata) = fs::symlink_metadata(&path) else {
        remove_empty_parent_dirs(workspace, path.parent())?;
        return Ok(());
    };
    remove_existing_path(&path, &metadata)?;
    remove_empty_parent_dirs(workspace, path.parent())?;
    Ok(())
}

fn remove_path_no_follow(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("failed to inspect ignored path {}: {error}", path.display()))?;
    remove_existing_path(path, &metadata)
}

fn remove_existing_path(path: &Path, metadata: &fs::Metadata) -> Result<(), String> {
    if metadata.is_dir() {
        fs::remove_dir_all(path).map_err(|error| {
            format!(
                "failed to remove ignored directory {}: {error}",
                path.display()
            )
        })?;
    } else {
        fs::remove_file(path).map_err(|error| {
            format!("failed to remove ignored file {}: {error}", path.display())
        })?;
    }
    Ok(())
}

fn remove_empty_parent_dirs(workspace: &Path, parent: Option<&Path>) -> Result<(), String> {
    let Some(parent) = parent else {
        return Ok(());
    };
    if parent == workspace || !parent.starts_with(workspace) {
        return Ok(());
    }
    if fs::remove_dir(parent).is_ok() {
        remove_empty_parent_dirs(workspace, parent.parent())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(dir: &Path, args: &[&str]) {
        let status = Command::new("git")
            .args(args)
            .current_dir(dir)
            .status()
            .unwrap();
        assert!(status.success(), "git command failed: {args:?}");
    }

    #[test]
    fn capture_patch_includes_untracked_files() {
        let workspace =
            std::env::temp_dir().join(format!("relay-teams-git-ops-{}", std::process::id()));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", "tracked.txt"]);
        run(
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
        fs::write(workspace.join("new.txt"), "new\n").unwrap();

        let paths = HistoryPaths::new(&workspace).unwrap();
        let patch = capture_patch(&workspace, &paths, "run-1", "HEAD", None).unwrap();
        let content = fs::read_to_string(&patch.path).unwrap();
        let _ = fs::remove_dir_all(&workspace);

        assert!(patch.has_diff);
        assert!(content.contains("new.txt"));
        assert!(content.contains("+new"));
    }

    #[test]
    fn restore_worktree_removes_untracked_harness_files() {
        let workspace =
            std::env::temp_dir().join(format!("relay-teams-git-clean-{}", std::process::id()));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", "tracked.txt"]);
        run(
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
        let rejected_file = workspace
            .join("tools")
            .join("performance_self_iteration")
            .join("src")
            .join("candidate.rs");
        fs::create_dir_all(rejected_file.parent().unwrap()).unwrap();
        fs::write(&rejected_file, "rejected\n").unwrap();

        restore_worktree(&workspace, "HEAD").unwrap();
        let exists = rejected_file.exists();
        let _ = fs::remove_dir_all(&workspace);

        assert!(!exists);
    }

    #[test]
    fn restore_worktree_state_cleans_candidate_before_switching_branch() {
        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-branch-restore-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", "tracked.txt"]);
        run(
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
        let base_state = capture_head_state(&workspace).unwrap();
        run(&workspace, &["switch", "-c", "candidate"]);
        fs::remove_file(workspace.join("tracked.txt")).unwrap();
        run(&workspace, &["add", "tracked.txt"]);
        run(
            &workspace,
            &[
                "-c",
                "user.email=test@example.com",
                "-c",
                "user.name=Test",
                "commit",
                "-m",
                "delete tracked",
            ],
        );
        fs::write(workspace.join("tracked.txt"), "candidate untracked\n").unwrap();

        restore_worktree_state(&workspace, &base_state).unwrap();
        let branch = capture_head_state(&workspace).unwrap().branch;
        let tracked = fs::read_to_string(workspace.join("tracked.txt")).unwrap();
        let _ = fs::remove_dir_all(&workspace);

        assert_eq!(branch.as_deref(), Some("main"));
        assert_eq!(tracked, "base\n");
    }

    #[test]
    fn git_metadata_snapshot_restores_config_and_removes_new_hooks() {
        let workspace =
            std::env::temp_dir().join(format!("relay-teams-git-metadata-{}", std::process::id()));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", "tracked.txt"]);
        run(
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
        let snapshot = GitMetadataSnapshot::capture(&workspace).unwrap();
        let config = workspace.join(".git").join("config");
        let original_config = fs::read_to_string(&config).unwrap();
        fs::write(&config, "[malicious\nchanged = true\n").unwrap();
        let hook = workspace.join(".git").join("hooks").join("pre-commit");
        fs::write(&hook, "#!/bin/sh\nexit 1\n").unwrap();

        let message = snapshot.restore_if_changed(&workspace).unwrap().unwrap();
        let restored_config = fs::read_to_string(&config).unwrap();
        let hook_exists = hook.exists();
        let clean = snapshot.restore_if_changed(&workspace).unwrap();
        let _ = fs::remove_dir_all(&workspace);

        assert!(message.contains("protected Git metadata"));
        assert_eq!(restored_config, original_config);
        assert!(!hook_exists);
        assert!(clean.is_none());
    }

    #[test]
    fn git_metadata_snapshot_rejects_oversized_current_metadata_without_buffering() {
        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-metadata-large-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", "tracked.txt"]);
        run(
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
        let snapshot = GitMetadataSnapshot::capture(&workspace).unwrap();
        let hook = workspace.join(".git").join("hooks").join("pre-commit");
        fs::write(
            &hook,
            vec![b'x'; (MAX_GIT_METADATA_FILE_BYTES + 1) as usize],
        )
        .unwrap();

        let message = snapshot.restore_if_changed(&workspace).unwrap().unwrap();
        let hook_exists = hook.exists();
        let _ = fs::remove_dir_all(&workspace);

        assert!(message.contains("protected Git metadata"));
        assert!(!hook_exists);
    }

    #[cfg(unix)]
    #[test]
    fn git_metadata_snapshot_does_not_follow_symlinked_info_parent() {
        use std::os::unix::fs::symlink;

        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-info-symlink-{}",
            std::process::id()
        ));
        let external = std::env::temp_dir().join(format!(
            "relay-teams-git-info-symlink-external-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        let _ = fs::remove_dir_all(&external);
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&external).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", "tracked.txt"]);
        run(
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
        let snapshot = GitMetadataSnapshot::capture(&workspace).unwrap();
        fs::write(external.join("exclude"), "external\n").unwrap();
        fs::remove_dir_all(workspace.join(".git").join("info")).unwrap();
        symlink(&external, workspace.join(".git").join("info")).unwrap();

        let message = snapshot.restore_if_changed(&workspace).unwrap().unwrap();
        let external_exclude = fs::read_to_string(external.join("exclude")).unwrap();
        let info_type = fs::symlink_metadata(workspace.join(".git").join("info"))
            .unwrap()
            .file_type();
        let restored_exclude_exists = workspace.join(".git").join("info").join("exclude").exists();
        let _ = fs::remove_dir_all(&workspace);
        let _ = fs::remove_dir_all(&external);

        assert!(message.contains("protected Git metadata"));
        assert_eq!(external_exclude, "external\n");
        assert!(!info_type.is_symlink());
        assert!(restored_exclude_exists);
    }

    #[test]
    fn restore_worktree_state_falls_back_when_saved_branch_was_deleted() {
        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-deleted-branch-restore-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", "tracked.txt"]);
        run(
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
        let base_state = capture_head_state(&workspace).unwrap();
        run(&workspace, &["switch", "-c", "candidate"]);
        run(&workspace, &["branch", "-D", "main"]);
        fs::write(workspace.join("tracked.txt"), "candidate\n").unwrap();

        restore_worktree_state(&workspace, &base_state).unwrap();
        let head = current_head(&workspace).unwrap();
        let branch = run_git(&workspace, &["branch", "--show-current"]).unwrap();
        let tracked = fs::read_to_string(workspace.join("tracked.txt")).unwrap();
        let _ = fs::remove_dir_all(&workspace);

        assert_eq!(head, base_state.commit);
        assert!(branch.trim().is_empty());
        assert_eq!(tracked, "base\n");
    }

    #[test]
    fn ignored_output_change_checks_snapshotted_contents() {
        let fingerprint = IgnoredOutputFingerprint {
            len: 10,
            modified_ns: Some(123),
        };
        let snapshot_entry = IgnoredOutputEntry {
            fingerprint: fingerprint.clone(),
            contents: Some(b"secret-old".to_vec()),
            symlink_target: None,
            removable_if_changed: false,
            filter_only: false,
        };
        let current_entry = IgnoredOutputEntry {
            fingerprint,
            contents: Some(b"secret-new".to_vec()),
            symlink_target: None,
            removable_if_changed: false,
            filter_only: false,
        };

        assert!(ignored_output_changed(&snapshot_entry, &current_entry));
    }

    #[test]
    fn worktree_changes_ignore_rules_detects_gitignore_changes() {
        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-ignore-rule-change-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join(".gitignore"), "secret.local\n").unwrap();
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", ".gitignore", "tracked.txt"]);
        run(
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
        fs::write(workspace.join(".gitignore"), "").unwrap();

        let changed = worktree_changes_ignore_rules(&workspace, "HEAD").unwrap();
        let _ = fs::remove_dir_all(&workspace);

        assert!(changed);
    }

    #[test]
    fn worktree_changes_ignore_rules_detects_untracked_gitignore() {
        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-untracked-ignore-rule-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", "tracked.txt"]);
        run(
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
        fs::create_dir_all(workspace.join("nested")).unwrap();
        fs::write(
            workspace.join("nested").join(".gitignore"),
            "!secret.local\n",
        )
        .unwrap();

        let changed = worktree_changes_ignore_rules(&workspace, "HEAD").unwrap();
        let _ = fs::remove_dir_all(&workspace);

        assert!(changed);
    }

    #[test]
    fn worktree_changes_ignore_rules_detects_renamed_gitignore() {
        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-ignore-rule-rename-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join(".gitignore"), "secret.local\n").unwrap();
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", ".gitignore", "tracked.txt"]);
        run(
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
        run(&workspace, &["mv", ".gitignore", "ignore.bak"]);

        let changed = worktree_changes_ignore_rules(&workspace, "HEAD").unwrap();
        let _ = fs::remove_dir_all(&workspace);

        assert!(changed);
    }

    #[test]
    fn worktree_changes_ignore_rules_skips_ignored_untracked_gitignore() {
        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-ignored-untracked-ignore-rule-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join(".gitignore"), "build/\n").unwrap();
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", ".gitignore", "tracked.txt"]);
        run(
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
        fs::create_dir_all(workspace.join("build")).unwrap();
        fs::write(workspace.join("build").join(".gitignore"), "*.tmp\n").unwrap();

        let changed = worktree_changes_ignore_rules(&workspace, "HEAD").unwrap();
        let _ = fs::remove_dir_all(&workspace);

        assert!(!changed);
    }

    #[test]
    fn git_info_exclude_allows_clean_defaults() {
        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-default-exclude-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", "tracked.txt"]);
        run(
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

        let changed = git_info_exclude_is_modified(&workspace, "HEAD").unwrap();
        let _ = fs::remove_dir_all(&workspace);

        assert!(!changed);
    }

    #[test]
    fn git_info_exclude_allows_clean_default_with_untracked_candidate() {
        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-default-exclude-untracked-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", "tracked.txt"]);
        run(
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
        fs::write(workspace.join("candidate.txt"), "candidate\n").unwrap();

        let changed = git_info_exclude_is_modified(&workspace, "HEAD").unwrap();
        let _ = fs::remove_dir_all(&workspace);

        assert!(!changed);
    }

    #[test]
    fn git_info_exclude_uses_git_path_for_linked_worktree() {
        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-linked-exclude-{}",
            std::process::id()
        ));
        let linked = std::env::temp_dir().join(format!(
            "relay-teams-git-linked-exclude-worktree-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        let _ = fs::remove_dir_all(&linked);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", "tracked.txt"]);
        run(
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
        run(
            &workspace,
            &[
                "worktree",
                "add",
                linked.to_str().unwrap_or_default(),
                "HEAD",
            ],
        );

        let changed = git_info_exclude_is_modified(&linked, "HEAD").unwrap();
        let _ = fs::remove_dir_all(&linked);
        let _ = fs::remove_dir_all(&workspace);

        assert!(!changed);
    }

    #[test]
    fn ignored_output_snapshot_excludes_cache_trees() {
        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-ignored-cache-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(workspace.join(".pytest_cache")).unwrap();
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(
            workspace.join(".gitignore"),
            ".pytest_cache/\nsecret.local\n",
        )
        .unwrap();
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", ".gitignore", "tracked.txt"]);
        run(
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
        fs::write(workspace.join(".pytest_cache").join("cache.bin"), "cache\n").unwrap();
        fs::write(workspace.join("secret.local"), "secret\n").unwrap();

        let snapshot = IgnoredOutputSnapshot::capture(&workspace).unwrap();
        let _ = fs::remove_dir_all(&workspace);

        assert!(snapshot.entries.contains_key("secret.local"));
        assert!(snapshot.entries[".pytest_cache"].filter_only);
        assert!(snapshot.entries[".pytest_cache/cache.bin"].filter_only);
    }

    #[test]
    fn capture_patch_excludes_files_under_filter_only_ignored_parents() {
        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-filter-only-parent-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join(".gitignore"), ".venv/\n").unwrap();
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", ".gitignore", "tracked.txt"]);
        run(
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
        fs::create_dir_all(workspace.join(".venv")).unwrap();
        fs::write(
            workspace.join(".venv").join("secret.db"),
            "do not capture\n",
        )
        .unwrap();
        let snapshot = IgnoredOutputSnapshot::capture(&workspace).unwrap();
        fs::write(workspace.join(".gitignore"), "").unwrap();
        fs::write(workspace.join("candidate.txt"), "candidate\n").unwrap();

        let paths = HistoryPaths::new(&workspace).unwrap();
        let patch = capture_patch(
            &workspace,
            &paths,
            "run-filter-parent",
            "HEAD",
            Some(&snapshot),
        )
        .unwrap();
        let content = fs::read_to_string(&patch.path).unwrap();
        let _ = fs::remove_dir_all(&workspace);

        assert!(content.contains("candidate.txt"));
        assert!(!content.contains(".venv/secret.db"));
        assert!(!content.contains("do not capture"));
    }

    #[test]
    fn restore_worktree_resets_candidate_ignored_outputs() {
        let workspace =
            std::env::temp_dir().join(format!("relay-teams-git-ignored-{}", std::process::id()));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(
            workspace.join(".gitignore"),
            "*.ignored\nignored-dir/\nchanged.cache\ntarget/\n.venv/\n",
        )
        .unwrap();
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", ".gitignore", "tracked.txt"]);
        run(
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
        fs::write(workspace.join("kept.ignored"), "baseline\n").unwrap();
        fs::write(workspace.join("changed.cache"), "baseline\n").unwrap();
        fs::write(workspace.join("deleted.ignored"), "baseline deleted\n").unwrap();
        fs::create_dir_all(workspace.join("target")).unwrap();
        fs::write(
            workspace.join("target").join("cache.bin"),
            "baseline cache\n",
        )
        .unwrap();
        fs::create_dir_all(workspace.join(".venv")).unwrap();
        fs::write(workspace.join(".venv").join("pyvenv.cfg"), "local env\n").unwrap();
        let snapshot = IgnoredOutputSnapshot::capture(&workspace).unwrap();
        assert!(snapshot.entries["target/cache.bin"].contents.is_none());
        assert!(snapshot.entries[".venv"].filter_only);
        assert!(snapshot.entries[".venv/pyvenv.cfg"].filter_only);
        fs::write(workspace.join("new.ignored"), "candidate\n").unwrap();
        fs::write(workspace.join("changed.cache"), "candidate changed\n").unwrap();
        fs::remove_file(workspace.join("deleted.ignored")).unwrap();
        fs::write(
            workspace.join("target").join("cache.bin"),
            "candidate cache\n",
        )
        .unwrap();
        fs::create_dir_all(workspace.join("ignored-dir")).unwrap();
        fs::write(
            workspace.join("ignored-dir").join("candidate.log"),
            "candidate\n",
        )
        .unwrap();

        let base_state = capture_head_state(&workspace).unwrap();
        restore_worktree_after_candidate(&workspace, &base_state, &snapshot).unwrap();
        let kept_exists = workspace.join("kept.ignored").exists();
        let new_exists = workspace.join("new.ignored").exists();
        let changed_content = fs::read_to_string(workspace.join("changed.cache")).unwrap();
        let deleted_content = fs::read_to_string(workspace.join("deleted.ignored")).unwrap();
        let ignored_dir_exists = workspace.join("ignored-dir").exists();
        let target_cache_exists = workspace.join("target").join("cache.bin").exists();
        let _ = fs::remove_dir_all(&workspace);

        assert!(kept_exists);
        assert!(!new_exists);
        assert_eq!(changed_content, "baseline\n");
        assert_eq!(deleted_content, "baseline deleted\n");
        assert!(!ignored_dir_exists);
        assert!(!target_cache_exists);
    }

    #[cfg(unix)]
    #[test]
    fn restore_worktree_restores_baseline_ignored_symlink_target() {
        use std::os::unix::fs::symlink;

        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-baseline-symlink-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join(".gitignore"), "secret.link\n").unwrap();
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", ".gitignore", "tracked.txt"]);
        run(
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
        symlink("original.env", workspace.join("secret.link")).unwrap();
        let snapshot = IgnoredOutputSnapshot::capture(&workspace).unwrap();
        fs::remove_file(workspace.join("secret.link")).unwrap();
        symlink("changed.env", workspace.join("secret.link")).unwrap();

        let base_state = capture_head_state(&workspace).unwrap();
        restore_worktree_after_candidate(&workspace, &base_state, &snapshot).unwrap();
        let restored_target = fs::read_link(workspace.join("secret.link")).unwrap();
        let _ = fs::remove_dir_all(&workspace);

        assert_eq!(restored_target, PathBuf::from("original.env"));
    }

    #[cfg(unix)]
    #[test]
    fn restore_worktree_removes_new_ignored_symlink_without_following() {
        use std::os::unix::fs::symlink;

        let workspace =
            std::env::temp_dir().join(format!("relay-teams-git-symlink-{}", std::process::id()));
        let target_dir = std::env::temp_dir().join(format!(
            "relay-teams-git-symlink-target-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        let _ = fs::remove_dir_all(&target_dir);
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&target_dir).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join(".gitignore"), "link.ignored\n").unwrap();
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", ".gitignore", "tracked.txt"]);
        run(
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
        let external_file = target_dir.join("external.txt");
        fs::write(&external_file, "external\n").unwrap();
        let snapshot = IgnoredOutputSnapshot::capture(&workspace).unwrap();
        symlink(&external_file, workspace.join("link.ignored")).unwrap();

        let base_state = capture_head_state(&workspace).unwrap();
        restore_worktree_after_candidate(&workspace, &base_state, &snapshot).unwrap();
        let link_exists = workspace.join("link.ignored").exists();
        let external_content = fs::read_to_string(&external_file).unwrap();
        let _ = fs::remove_dir_all(&workspace);
        let _ = fs::remove_dir_all(&target_dir);

        assert!(!link_exists);
        assert_eq!(external_content, "external\n");
    }

    #[cfg(unix)]
    #[test]
    fn restore_worktree_replaces_ignored_symlink_swap_before_restore() {
        use std::os::unix::fs::symlink;

        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-symlink-swap-{}",
            std::process::id()
        ));
        let target_dir = std::env::temp_dir().join(format!(
            "relay-teams-git-symlink-swap-target-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        let _ = fs::remove_dir_all(&target_dir);
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&target_dir).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join(".gitignore"), "safe.ignored\n").unwrap();
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", ".gitignore", "tracked.txt"]);
        run(
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
        fs::write(workspace.join("safe.ignored"), "baseline\n").unwrap();
        let snapshot = IgnoredOutputSnapshot::capture(&workspace).unwrap();
        let external_file = target_dir.join("external.txt");
        fs::write(&external_file, "external\n").unwrap();
        fs::remove_file(workspace.join("safe.ignored")).unwrap();
        symlink(&external_file, workspace.join("safe.ignored")).unwrap();
        let base_state = capture_head_state(&workspace).unwrap();

        restore_worktree_after_candidate(&workspace, &base_state, &snapshot).unwrap();
        let restored_content = fs::read_to_string(workspace.join("safe.ignored")).unwrap();
        let restored_type = fs::symlink_metadata(workspace.join("safe.ignored"))
            .unwrap()
            .file_type();
        let external_content = fs::read_to_string(&external_file).unwrap();
        let _ = fs::remove_dir_all(&workspace);
        let _ = fs::remove_dir_all(&target_dir);

        assert_eq!(restored_content, "baseline\n");
        assert!(!restored_type.is_symlink());
        assert_eq!(external_content, "external\n");
    }

    #[test]
    fn capture_patch_skips_nested_git_directories() {
        let workspace =
            std::env::temp_dir().join(format!("relay-teams-git-nested-{}", std::process::id()));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", "tracked.txt"]);
        run(
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
        let nested = workspace.join("nested-repo");
        fs::create_dir_all(&nested).unwrap();
        run(&nested, &["init", "-b", "main"]);
        fs::write(nested.join("file.txt"), "nested\n").unwrap();

        let paths = HistoryPaths::new(&workspace).unwrap();
        let patch = capture_patch(&workspace, &paths, "run-nested", "HEAD", None).unwrap();
        restore_worktree(&workspace, "HEAD").unwrap();
        let nested_exists = nested.exists();
        let _ = fs::remove_dir_all(&workspace);

        assert!(!patch.has_diff);
        assert!(!nested_exists);
    }

    #[test]
    fn capture_patch_rejects_oversized_diff() {
        let workspace =
            std::env::temp_dir().join(format!("relay-teams-git-large-{}", std::process::id()));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", "tracked.txt"]);
        run(
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
        fs::write(
            workspace.join("large.txt"),
            vec![b'x'; MAX_CAPTURED_PATCH_BYTES + 1],
        )
        .unwrap();

        let paths = HistoryPaths::new(&workspace).unwrap();
        let error = capture_patch(&workspace, &paths, "run-large", "HEAD", None).unwrap_err();
        let patch_exists = paths.patches.join("run-large.patch").exists();
        let _ = fs::remove_dir_all(&workspace);

        assert!(error.contains("candidate patch exceeds"));
        assert!(!patch_exists);
    }

    #[test]
    fn capture_patch_rejects_oversized_untracked_file_list() {
        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-large-untracked-list-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", "tracked.txt"]);
        run(
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
        for index in 0..20 {
            fs::write(
                workspace.join(format!("{}-{index}.txt", "x".repeat(80))),
                "candidate\n",
            )
            .unwrap();
        }

        let paths = HistoryPaths::new(&workspace).unwrap();
        let error =
            capture_patch(&workspace, &paths, "run-untracked-large", "HEAD", None).unwrap_err();
        let patch_exists = paths.patches.join("run-untracked-large.patch").exists();
        let _ = fs::remove_dir_all(&workspace);

        assert!(error.contains("untracked file list exceeds"));
        assert!(!patch_exists);
    }

    #[test]
    fn verify_patch_unchanged_rejects_post_evaluation_changes() {
        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-post-eval-change-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", "tracked.txt"]);
        run(
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
        fs::write(workspace.join("candidate.txt"), "candidate\n").unwrap();
        let paths = HistoryPaths::new(&workspace).unwrap();
        let patch = capture_patch(&workspace, &paths, "run-post-eval", "HEAD", None).unwrap();
        fs::write(workspace.join("side-effect.txt"), "not evaluated\n").unwrap();

        let error =
            verify_patch_unchanged(&workspace, &paths, "run-post-eval", "HEAD", None, &patch)
                .unwrap_err();
        let check_patch_exists = paths
            .patches
            .join("run-post-eval-post-evaluation.patch")
            .exists();
        let _ = fs::remove_dir_all(&workspace);

        assert!(error.contains("worktree changed after evaluation"));
        assert!(!check_patch_exists);
    }

    #[test]
    fn capture_patch_excludes_baseline_ignored_files() {
        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-baseline-ignored-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join(".gitignore"), "secret.local\n").unwrap();
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", ".gitignore", "tracked.txt"]);
        run(
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
        fs::write(workspace.join("secret.local"), "do not capture\n").unwrap();
        let snapshot = IgnoredOutputSnapshot::capture(&workspace).unwrap();
        fs::write(workspace.join(".gitignore"), "").unwrap();
        fs::write(workspace.join("candidate.txt"), "candidate\n").unwrap();

        let paths = HistoryPaths::new(&workspace).unwrap();
        let patch =
            capture_patch(&workspace, &paths, "run-baseline", "HEAD", Some(&snapshot)).unwrap();
        let content = fs::read_to_string(&patch.path).unwrap();
        let _ = fs::remove_dir_all(&workspace);

        assert!(content.contains("candidate.txt"));
        assert!(!content.contains("diff --git a/secret.local"));
        assert!(!content.contains("do not capture"));
    }

    #[test]
    fn restore_ignored_outputs_removes_filter_only_tree_that_becomes_unignored() {
        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-filter-only-unignored-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join(".gitignore"), ".venv/\n").unwrap();
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", ".gitignore", "tracked.txt"]);
        run(
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
        fs::create_dir_all(workspace.join(".venv").join("cache")).unwrap();
        fs::write(
            workspace.join(".venv").join("cache").join("file.py"),
            "cache\n",
        )
        .unwrap();
        let snapshot = IgnoredOutputSnapshot::capture(&workspace).unwrap();
        fs::write(workspace.join(".gitignore"), "").unwrap();

        restore_ignored_outputs(&workspace, &snapshot).unwrap();
        let venv_exists = workspace.join(".venv").exists();
        let _ = fs::remove_dir_all(&workspace);

        assert!(!venv_exists);
    }

    #[test]
    fn restore_ignored_outputs_removes_file_that_becomes_unignored() {
        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-file-unignored-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join(".gitignore"), "secret.local\n").unwrap();
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", ".gitignore", "tracked.txt"]);
        run(
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
        fs::write(workspace.join("secret.local"), "local\n").unwrap();
        let snapshot = IgnoredOutputSnapshot::capture(&workspace).unwrap();
        fs::write(workspace.join(".gitignore"), "").unwrap();

        restore_ignored_outputs(&workspace, &snapshot).unwrap();
        let secret_exists = workspace.join("secret.local").exists();
        let _ = fs::remove_dir_all(&workspace);

        assert!(!secret_exists);
    }

    #[test]
    fn capture_patch_rejects_staged_baseline_ignored_files() {
        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-staged-baseline-ignored-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join(".gitignore"), "secret.local\n").unwrap();
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", ".gitignore", "tracked.txt"]);
        run(
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
        fs::write(workspace.join("secret.local"), "do not capture\n").unwrap();
        let snapshot = IgnoredOutputSnapshot::capture(&workspace).unwrap();
        run(&workspace, &["add", "-f", "secret.local"]);

        let paths = HistoryPaths::new(&workspace).unwrap();
        let error =
            capture_patch(&workspace, &paths, "run-staged", "HEAD", Some(&snapshot)).unwrap_err();
        let staged = run_git(&workspace, &["diff", "--cached", "--name-only"]).unwrap();
        let patch_exists = paths.patches.join("run-staged.patch").exists();
        let _ = fs::remove_dir_all(&workspace);

        assert!(error.contains("baseline ignored files were staged"));
        assert!(error.contains("secret.local"));
        assert!(!staged.contains("secret.local"));
        assert!(!patch_exists);
    }

    #[cfg(unix)]
    #[test]
    fn restore_worktree_unlinks_hard_link_before_restore() {
        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-hardlink-swap-{}",
            std::process::id()
        ));
        let target_dir = std::env::temp_dir().join(format!(
            "relay-teams-git-hardlink-target-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        let _ = fs::remove_dir_all(&target_dir);
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&target_dir).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join(".gitignore"), "safe.ignored\n").unwrap();
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", ".gitignore", "tracked.txt"]);
        run(
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
        fs::write(workspace.join("safe.ignored"), "baseline\n").unwrap();
        let snapshot = IgnoredOutputSnapshot::capture(&workspace).unwrap();
        let external_file = target_dir.join("external.txt");
        fs::write(&external_file, "external\n").unwrap();
        fs::remove_file(workspace.join("safe.ignored")).unwrap();
        fs::hard_link(&external_file, workspace.join("safe.ignored")).unwrap();
        let base_state = capture_head_state(&workspace).unwrap();

        restore_worktree_after_candidate(&workspace, &base_state, &snapshot).unwrap();
        let restored_content = fs::read_to_string(workspace.join("safe.ignored")).unwrap();
        let external_content = fs::read_to_string(&external_file).unwrap();
        let _ = fs::remove_dir_all(&workspace);
        let _ = fs::remove_dir_all(&target_dir);

        assert_eq!(restored_content, "baseline\n");
        assert_eq!(external_content, "external\n");
    }

    #[cfg(unix)]
    #[test]
    fn restore_worktree_replaces_symlinked_parent_before_restore() {
        use std::os::unix::fs::symlink;

        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-parent-symlink-{}",
            std::process::id()
        ));
        let target_dir = std::env::temp_dir().join(format!(
            "relay-teams-git-parent-symlink-target-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        let _ = fs::remove_dir_all(&target_dir);
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&target_dir).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join(".gitignore"), "ignored-dir/\n").unwrap();
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", ".gitignore", "tracked.txt"]);
        run(
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
        fs::create_dir_all(workspace.join("ignored-dir")).unwrap();
        fs::write(
            workspace.join("ignored-dir").join("safe.ignored"),
            "baseline\n",
        )
        .unwrap();
        let snapshot = IgnoredOutputSnapshot::capture(&workspace).unwrap();
        fs::write(target_dir.join("safe.ignored"), "external\n").unwrap();
        fs::remove_dir_all(workspace.join("ignored-dir")).unwrap();
        symlink(&target_dir, workspace.join("ignored-dir")).unwrap();
        let base_state = capture_head_state(&workspace).unwrap();

        restore_worktree_after_candidate(&workspace, &base_state, &snapshot).unwrap();
        let restored_content =
            fs::read_to_string(workspace.join("ignored-dir").join("safe.ignored")).unwrap();
        let parent_type = fs::symlink_metadata(workspace.join("ignored-dir"))
            .unwrap()
            .file_type();
        let external_content = fs::read_to_string(target_dir.join("safe.ignored")).unwrap();
        let _ = fs::remove_dir_all(&workspace);
        let _ = fs::remove_dir_all(&target_dir);

        assert_eq!(restored_content, "baseline\n");
        assert!(!parent_type.is_symlink());
        assert_eq!(external_content, "external\n");
    }

    #[cfg(unix)]
    #[test]
    fn failed_commit_restores_original_index() {
        use std::os::unix::fs::PermissionsExt;

        let workspace =
            std::env::temp_dir().join(format!("relay-teams-git-index-{}", std::process::id()));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", "tracked.txt"]);
        run(
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
        fs::write(workspace.join("tracked.txt"), "staged\n").unwrap();
        run(&workspace, &["add", "tracked.txt"]);
        fs::write(workspace.join("unstaged.txt"), "candidate\n").unwrap();
        let hook = workspace.join(".git").join("hooks").join("pre-commit");
        fs::write(&hook, "#!/bin/sh\nexit 1\n").unwrap();
        let mut permissions = fs::metadata(&hook).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&hook, permissions).unwrap();

        let result = commit_candidate(&workspace, Some("candidate"), 1.0, None);
        let staged = run_git(&workspace, &["diff", "--cached", "--name-only"]).unwrap();
        let unstaged =
            run_git(&workspace, &["ls-files", "--others", "--exclude-standard"]).unwrap();
        let _ = fs::remove_dir_all(&workspace);

        assert!(result.is_err());
        assert_eq!(staged.trim(), "tracked.txt");
        assert_eq!(unstaged.trim(), "unstaged.txt");
    }

    #[test]
    fn commit_candidate_excludes_baseline_ignored_files() {
        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-commit-baseline-ignored-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join(".gitignore"), "secret.local\n").unwrap();
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", ".gitignore", "tracked.txt"]);
        run(
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
        fs::write(workspace.join("secret.local"), "do not commit\n").unwrap();
        let snapshot = IgnoredOutputSnapshot::capture(&workspace).unwrap();
        fs::write(workspace.join(".gitignore"), "").unwrap();
        fs::write(workspace.join("candidate.txt"), "candidate\n").unwrap();
        run(&workspace, &["config", "user.email", "test@example.com"]);
        run(&workspace, &["config", "user.name", "Test"]);

        let commit = commit_candidate(&workspace, Some("candidate"), 1.0, Some(&snapshot)).unwrap();
        let committed_files = run_git(
            &workspace,
            &["show", "--name-only", "--format=", commit.as_str()],
        )
        .unwrap();
        let untracked =
            run_git(&workspace, &["ls-files", "--others", "--exclude-standard"]).unwrap();
        let _ = fs::remove_dir_all(&workspace);

        assert!(committed_files.contains(".gitignore"));
        assert!(committed_files.contains("candidate.txt"));
        assert!(!committed_files.contains("secret.local"));
        assert_eq!(untracked.trim(), "secret.local");
    }

    #[test]
    fn commit_candidate_rejects_staged_baseline_ignored_files() {
        let workspace = std::env::temp_dir().join(format!(
            "relay-teams-git-commit-staged-baseline-ignored-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(&workspace).unwrap();
        run(&workspace, &["init", "-b", "main"]);
        fs::write(workspace.join(".gitignore"), "secret.local\n").unwrap();
        fs::write(workspace.join("tracked.txt"), "base\n").unwrap();
        run(&workspace, &["add", ".gitignore", "tracked.txt"]);
        run(
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
        fs::write(workspace.join("secret.local"), "do not commit\n").unwrap();
        let snapshot = IgnoredOutputSnapshot::capture(&workspace).unwrap();
        run(&workspace, &["add", "-f", "secret.local"]);
        run(&workspace, &["config", "user.email", "test@example.com"]);
        run(&workspace, &["config", "user.name", "Test"]);
        let head_before = current_head(&workspace).unwrap();

        let error =
            commit_candidate(&workspace, Some("candidate"), 1.0, Some(&snapshot)).unwrap_err();
        let head_after = current_head(&workspace).unwrap();
        let staged = run_git(&workspace, &["diff", "--cached", "--name-only"]).unwrap();
        let _ = fs::remove_dir_all(&workspace);

        assert!(error.contains("baseline ignored files were staged"));
        assert!(error.contains("secret.local"));
        assert_eq!(head_after, head_before);
        assert!(!staged.contains("secret.local"));
    }
}
