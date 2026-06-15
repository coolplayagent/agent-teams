use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;

const MAX_LOG_SCAN_BYTES: usize = 4 * 1024 * 1024;
const MAX_LOG_LINE_BYTES: usize = 16 * 1024;
const MAX_LOG_FIELD_WINDOW_BYTES: usize = 2048;
const MAX_LOG_ANCHOR_BYTES: u64 = 256;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogFinding {
    pub severity: String,
    pub signature: String,
    pub count: usize,
    pub sample: String,
}

#[derive(Debug, Clone)]
pub struct LogWindow {
    pub path: PathBuf,
    pub offset: u64,
    file_id: Option<FileIdentity>,
    anchor: Option<LogAnchor>,
}

#[derive(Debug, Clone)]
struct LogAnchor {
    offset: u64,
    bytes: Vec<u8>,
}

pub fn capture_log_windows(paths: &[PathBuf]) -> Result<Vec<LogWindow>, String> {
    paths
        .iter()
        .map(|path| {
            let (offset, file_id, anchor) = if path.exists() {
                let metadata = fs::metadata(path)
                    .map_err(|error| format!("failed to stat log {}: {error}", path.display()))?;
                let offset = metadata.len();
                (
                    offset,
                    file_identity(&metadata),
                    capture_log_anchor(path, offset)?,
                )
            } else {
                (0, None, None)
            };
            Ok(LogWindow {
                path: path.clone(),
                offset,
                file_id,
                anchor,
            })
        })
        .collect()
}

pub fn scan_log_windows(windows: &[LogWindow]) -> Result<Vec<LogFinding>, String> {
    let mut findings: BTreeMap<(String, String), LogFinding> = BTreeMap::new();
    for window in windows {
        scan_one(window, &mut findings)?;
    }
    Ok(findings.into_values().collect())
}

fn scan_one(
    window: &LogWindow,
    findings: &mut BTreeMap<(String, String), LogFinding>,
) -> Result<(), String> {
    let path = &window.path;
    if !path.exists() {
        return Ok(());
    }
    let metadata = fs::metadata(path)
        .map_err(|error| format!("failed to stat log {}: {error}", path.display()))?;
    let offset = scan_start_offset(window, path, &metadata)?;
    let mut file = File::open(path)
        .map_err(|error| format!("failed to read log {}: {error}", path.display()))?;
    file.seek(SeekFrom::Start(offset))
        .map_err(|error| format!("failed to seek log {}: {error}", path.display()))?;
    let mut scanned_bytes = 0usize;
    let mut line = LogLineCapture::default();
    let mut buffer = [0_u8; 8192];
    let truncated = metadata.len().saturating_sub(offset) > MAX_LOG_SCAN_BYTES as u64;
    loop {
        let remaining = MAX_LOG_SCAN_BYTES.saturating_sub(scanned_bytes);
        if remaining == 0 {
            break;
        }
        let read_limit = remaining.min(buffer.len());
        let count = file
            .read(&mut buffer[..read_limit])
            .map_err(|error| format!("failed to read log {}: {error}", path.display()))?;
        if count == 0 {
            break;
        }
        scanned_bytes = scanned_bytes.saturating_add(count);
        for byte in &buffer[..count] {
            if *byte == b'\n' {
                record_log_line(&line, findings);
                line.clear();
            } else {
                line.push(*byte);
            }
        }
    }
    if !line.is_empty() {
        record_log_line(&line, findings);
    }
    if truncated {
        record_log_scan_truncated(path, findings);
    }
    Ok(())
}

fn record_log_scan_truncated(path: &Path, findings: &mut BTreeMap<(String, String), LogFinding>) {
    let severity = "ERROR".to_owned();
    let signature = format!("log scan exceeded {} byte cap", MAX_LOG_SCAN_BYTES);
    findings
        .entry((severity.clone(), signature.clone()))
        .and_modify(|finding| finding.count = finding.count.saturating_add(1))
        .or_insert_with(|| LogFinding {
            severity,
            signature,
            count: 1,
            sample: format!(
                "log window for {} exceeded {} bytes; candidate emitted too much log output to scan completely",
                path.display(),
                MAX_LOG_SCAN_BYTES
            ),
        });
}

#[derive(Default)]
struct LogLineCapture {
    sample: Vec<u8>,
    field_window: Vec<u8>,
    severity_hint: Option<&'static str>,
    event_hint: Option<String>,
}

impl LogLineCapture {
    fn push(&mut self, byte: u8) {
        if self.sample.len() < MAX_LOG_LINE_BYTES {
            self.sample.push(byte);
        }
        self.capture_field_hints(byte);
    }

    fn clear(&mut self) {
        self.sample.clear();
        self.field_window.clear();
        self.severity_hint = None;
        self.event_hint = None;
    }

    fn is_empty(&self) -> bool {
        self.sample.is_empty() && self.field_window.is_empty()
    }

    fn capture_field_hints(&mut self, byte: u8) {
        if self.severity_hint.is_some() && self.event_hint.is_some() {
            return;
        }
        if self.field_window.len() == MAX_LOG_FIELD_WINDOW_BYTES {
            self.field_window.drain(0..MAX_LOG_FIELD_WINDOW_BYTES / 2);
        }
        self.field_window.push(byte);
        if byte != b'"' {
            return;
        }
        let window = String::from_utf8_lossy(&self.field_window);
        if self.severity_hint.is_none() {
            self.severity_hint = json_text_level(&window).and_then(normalize_level);
        }
        if self.event_hint.is_none() {
            self.event_hint = json_text_field(&window, "event").map(str::to_owned);
        }
    }
}

fn record_log_line(line: &LogLineCapture, findings: &mut BTreeMap<(String, String), LogFinding>) {
    let sample = String::from_utf8_lossy(&line.sample);
    let Some(severity) = line.severity_hint.or_else(|| line_severity(&sample)) else {
        return;
    };
    let signature = line
        .event_hint
        .clone()
        .unwrap_or_else(|| signature(&sample));
    let key = (severity.to_owned(), signature.clone());
    findings
        .entry(key)
        .and_modify(|finding| finding.count += 1)
        .or_insert_with(|| LogFinding {
            severity: severity.to_owned(),
            signature,
            count: 1,
            sample: sample.trim_end().chars().take(500).collect(),
        });
}

fn capture_log_anchor(path: &PathBuf, offset: u64) -> Result<Option<LogAnchor>, String> {
    if offset == 0 {
        return Ok(None);
    }
    let anchor_len = offset.min(MAX_LOG_ANCHOR_BYTES);
    let anchor_offset = offset.saturating_sub(anchor_len);
    let mut file = File::open(path)
        .map_err(|error| format!("failed to read log anchor {}: {error}", path.display()))?;
    file.seek(SeekFrom::Start(anchor_offset))
        .map_err(|error| format!("failed to seek log anchor {}: {error}", path.display()))?;
    let mut bytes = vec![0_u8; anchor_len as usize];
    file.read_exact(&mut bytes)
        .map_err(|error| format!("failed to read log anchor {}: {error}", path.display()))?;
    Ok(Some(LogAnchor {
        offset: anchor_offset,
        bytes,
    }))
}

fn scan_start_offset(
    window: &LogWindow,
    path: &PathBuf,
    metadata: &fs::Metadata,
) -> Result<u64, String> {
    if metadata.len() < window.offset {
        return Ok(0);
    }
    if let (Some(previous), Some(current)) = (&window.file_id, file_identity(metadata)) {
        if previous != &current {
            return Ok(0);
        }
    }
    if let Some(anchor) = &window.anchor {
        if !log_anchor_matches(path, anchor)? {
            return Ok(0);
        }
    }
    Ok(window.offset)
}

fn log_anchor_matches(path: &PathBuf, anchor: &LogAnchor) -> Result<bool, String> {
    let mut file = File::open(path)
        .map_err(|error| format!("failed to read log anchor {}: {error}", path.display()))?;
    file.seek(SeekFrom::Start(anchor.offset))
        .map_err(|error| format!("failed to seek log anchor {}: {error}", path.display()))?;
    let mut bytes = vec![0_u8; anchor.bytes.len()];
    file.read_exact(&mut bytes)
        .map_err(|error| format!("failed to read log anchor {}: {error}", path.display()))?;
    Ok(bytes == anchor.bytes)
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct FileIdentity {
    device: u64,
    inode: u64,
}

#[cfg(unix)]
fn file_identity(metadata: &fs::Metadata) -> Option<FileIdentity> {
    use std::os::unix::fs::MetadataExt;

    Some(FileIdentity {
        device: metadata.dev(),
        inode: metadata.ino(),
    })
}

#[cfg(not(unix))]
fn file_identity(_metadata: &fs::Metadata) -> Option<FileIdentity> {
    None
}

fn line_severity(line: &str) -> Option<&'static str> {
    if let Ok(value) = serde_json::from_str::<Value>(line) {
        return json_level(&value).and_then(normalize_level);
    }
    json_text_level(line)
        .or_else(|| text_level(line))
        .and_then(normalize_level)
}

fn json_level(value: &Value) -> Option<&str> {
    ["level", "levelname", "severity"]
        .into_iter()
        .find_map(|field| value.get(field).and_then(Value::as_str))
}

fn json_text_level(line: &str) -> Option<&str> {
    ["level", "levelname", "severity"]
        .into_iter()
        .find_map(|field| json_text_field(line, field))
}

fn json_text_field<'line>(line: &'line str, field: &str) -> Option<&'line str> {
    let needle = format!("\"{field}\"");
    let start = line.find(&needle)?;
    let value = line[start + needle.len()..].trim_start();
    let value = value.strip_prefix(':')?.trim_start();
    let value = value.strip_prefix('"')?;
    let end = value.find('"')?;
    Some(&value[..end])
}

fn text_level(line: &str) -> Option<&str> {
    for field in line.split(['|', '\t']).take(6) {
        let level = field.trim();
        if is_known_level(level) {
            return Some(level);
        }
    }
    for token in line.split_whitespace().take(8) {
        let level = token.trim_matches(|ch: char| !ch.is_ascii_alphabetic());
        if is_known_level(level) {
            return Some(level);
        }
    }
    None
}

fn normalize_level(level: &str) -> Option<&'static str> {
    if level.eq_ignore_ascii_case("ERROR") {
        Some("ERROR")
    } else if level.eq_ignore_ascii_case("WARNING") || level.eq_ignore_ascii_case("WARN") {
        Some("WARNING")
    } else {
        None
    }
}

fn is_known_level(value: &str) -> bool {
    ["ERROR", "WARNING", "WARN", "INFO", "DEBUG", "TRACE"]
        .into_iter()
        .any(|level| value.eq_ignore_ascii_case(level))
}

fn signature(line: &str) -> String {
    if let Ok(value) = serde_json::from_str::<Value>(line) {
        if let Some(event) = value.get("event").and_then(Value::as_str) {
            return event.to_owned();
        }
    }
    if let Some(event) = json_text_field(line, "event") {
        return event.to_owned();
    }
    if let Some(event) = text_event_signature(line) {
        return event;
    }
    let pipe_fields = line.split('|').map(str::trim).collect::<Vec<_>>();
    let signature_source = pipe_fields
        .iter()
        .position(|field| is_known_level(field))
        .and_then(|index| {
            let fields = pipe_fields
                .iter()
                .skip(index + 1)
                .copied()
                .filter(|field| !field.is_empty())
                .collect::<Vec<_>>();
            if fields.is_empty() {
                None
            } else {
                Some(fields.join(" "))
            }
        })
        .unwrap_or_else(|| line.to_owned());
    signature_source
        .split_whitespace()
        .filter(|part| !is_volatile_signature_token(part))
        .take(10)
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(160)
        .collect()
}

fn text_event_signature(line: &str) -> Option<String> {
    line.split(['|', '\t', ' ']).find_map(|part| {
        let value = part.trim();
        value
            .strip_prefix("event=")
            .map(|event| event.trim_matches(['"', '\'', ',']).to_owned())
            .filter(|event| !event.is_empty())
    })
}

fn is_volatile_signature_token(token: &str) -> bool {
    let trimmed = token.trim_matches(|ch: char| {
        !ch.is_ascii_alphanumeric() && ch != '-' && ch != ':' && ch != '.' && ch != 'T' && ch != 'Z'
    });
    trimmed.chars().all(|ch| ch.is_ascii_digit())
        || looks_like_iso_timestamp(trimmed)
        || looks_like_iso_date(trimmed)
        || looks_like_clock_time(trimmed)
}

fn looks_like_iso_timestamp(value: &str) -> bool {
    value.len() >= 19
        && value.as_bytes().get(4) == Some(&b'-')
        && value.as_bytes().get(7) == Some(&b'-')
        && matches!(value.as_bytes().get(10), Some(b'T') | Some(b' '))
        && value.as_bytes().get(13) == Some(&b':')
        && value.as_bytes().get(16) == Some(&b':')
}

fn looks_like_iso_date(value: &str) -> bool {
    value.len() == 10
        && value.as_bytes().get(4) == Some(&b'-')
        && value.as_bytes().get(7) == Some(&b'-')
        && value
            .chars()
            .enumerate()
            .all(|(index, ch)| matches!(index, 4 | 7) || ch.is_ascii_digit())
}

fn looks_like_clock_time(value: &str) -> bool {
    value.len() >= 8
        && value.as_bytes().get(2) == Some(&b':')
        && value.as_bytes().get(5) == Some(&b':')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_log_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "relay-teams-{name}-{}-{}.log",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn signature_prefers_json_event() {
        assert_eq!(
            signature(r#"{"level":"WARNING","event":"route.slow","message":"slow"}"#),
            "route.slow"
        );
    }

    #[test]
    fn signature_prefers_human_readable_event_field() {
        assert_eq!(
            signature("2026-06-13T15:00:01.123Z | WARNING | event=route.slow | duration_ms=900"),
            "route.slow"
        );
    }

    #[test]
    fn signature_drops_human_readable_timestamp_prefix() {
        assert_eq!(
            signature("2026-06-13T15:00:01.123Z | WARNING | worker | repeated failure"),
            signature("2026-06-13T15:00:02.456Z | WARNING | worker | repeated failure")
        );
    }

    #[test]
    fn scan_log_windows_ignores_previous_content() {
        let path = temp_log_path("log-window");
        fs::write(&path, "ERROR old failure\n").unwrap();
        let windows = capture_log_windows(std::slice::from_ref(&path)).unwrap();
        fs::write(&path, "ERROR old failure\nWARNING new warning\n").unwrap();

        let findings = scan_log_windows(&windows).unwrap();
        let _ = fs::remove_file(&path);

        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].severity, "WARNING");
    }

    #[test]
    fn scan_log_windows_bounds_long_lines() {
        let path = temp_log_path("log-long-line");
        let windows = capture_log_windows(std::slice::from_ref(&path)).unwrap();
        fs::write(
            &path,
            format!("ERROR event=huge {}\n", "x".repeat(MAX_LOG_LINE_BYTES * 2)),
        )
        .unwrap();

        let findings = scan_log_windows(&windows).unwrap();
        let _ = fs::remove_file(&path);

        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].signature, "huge");
        assert!(findings[0].sample.len() <= 500);
    }

    #[test]
    fn scan_log_windows_records_error_when_window_exceeds_scan_cap() {
        let path = temp_log_path("log-scan-cap");
        let windows = capture_log_windows(std::slice::from_ref(&path)).unwrap();
        fs::write(&path, "x".repeat(MAX_LOG_SCAN_BYTES + 1)).unwrap();

        let findings = scan_log_windows(&windows).unwrap();
        let _ = fs::remove_file(&path);

        assert!(findings.iter().any(|finding| finding.severity == "ERROR"
            && finding.signature.contains("log scan exceeded")));
    }

    #[test]
    fn scan_log_windows_detects_truncated_json_error_line() {
        let path = temp_log_path("log-truncated-json");
        let windows = capture_log_windows(std::slice::from_ref(&path)).unwrap();
        fs::write(
            &path,
            format!(
                r#"{{"padding":"{}","level":"ERROR","event":"route.huge","message":"failed"#,
                "x".repeat(MAX_LOG_LINE_BYTES * 2)
            ),
        )
        .unwrap();

        let findings = scan_log_windows(&windows).unwrap();
        let _ = fs::remove_file(&path);

        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].severity, "ERROR");
        assert_eq!(findings[0].signature, "route.huge");
        assert!(findings[0].sample.len() <= 500);
    }

    #[test]
    fn scan_log_windows_bounds_long_line_without_newline() {
        let path = temp_log_path("log-long-line-no-newline");
        let windows = capture_log_windows(std::slice::from_ref(&path)).unwrap();
        fs::write(
            &path,
            format!("WARNING event=huge {}", "x".repeat(MAX_LOG_SCAN_BYTES * 2)),
        )
        .unwrap();

        let findings = scan_log_windows(&windows).unwrap();
        let _ = fs::remove_file(&path);

        assert_eq!(findings.len(), 2);
        assert!(
            findings
                .iter()
                .any(|finding| finding.signature == "huge" && finding.sample.len() <= 500)
        );
        assert!(findings.iter().any(|finding| finding.severity == "ERROR"
            && finding.signature.contains("log scan exceeded")));
    }

    #[test]
    fn scan_log_windows_restarts_when_active_log_shrinks() {
        let path = temp_log_path("rotated-window");
        fs::write(&path, "INFO older line before capture\n".repeat(8)).unwrap();
        let windows = capture_log_windows(std::slice::from_ref(&path)).unwrap();
        fs::write(&path, "WARNING rotated warning after truncation\n").unwrap();

        let findings = scan_log_windows(&windows).unwrap();
        let _ = fs::remove_file(&path);

        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].severity, "WARNING");
    }

    #[test]
    fn scan_log_windows_restarts_after_copytruncate_growth() {
        let path = temp_log_path("copytruncate-window");
        let previous = "INFO older line before capture\n".repeat(32);
        fs::write(&path, &previous).unwrap();
        let windows = capture_log_windows(std::slice::from_ref(&path)).unwrap();
        let replacement = format!("ERROR copytruncate warning\n{}", "x".repeat(previous.len()));
        fs::write(&path, replacement).unwrap();

        let findings = scan_log_windows(&windows).unwrap();
        let _ = fs::remove_file(&path);

        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].severity, "ERROR");
    }

    #[test]
    fn line_severity_uses_structured_level_not_message_text() {
        assert_eq!(
            line_severity(r#"{"level":"INFO","event":"log.note","message":"mentions ERROR"}"#),
            None
        );
        assert_eq!(
            line_severity("2026-06-13T00:00:00Z | INFO | mentions ERROR in the message"),
            None
        );
        assert_eq!(
            line_severity(r#"{"level":"ERROR","event":"log.failed","message":"failed"}"#),
            Some("ERROR")
        );
        assert_eq!(
            line_severity("2026-06-13T00:00:00Z | WARN | slow request"),
            Some("WARNING")
        );
    }

    #[test]
    fn scan_start_offset_restarts_for_replaced_file_identity() {
        let path = temp_log_path("identity-window");
        fs::write(&path, "WARNING replacement\n").unwrap();
        let metadata = fs::metadata(&path).unwrap();
        let current = file_identity(&metadata).unwrap_or(FileIdentity {
            device: 0,
            inode: 0,
        });
        let window = LogWindow {
            path: path.clone(),
            offset: 11,
            file_id: Some(FileIdentity {
                device: current.device.saturating_add(1),
                inode: current.inode.saturating_add(1),
            }),
            anchor: None,
        };

        let offset = scan_start_offset(&window, &path, &metadata).unwrap();
        let _ = fs::remove_file(&path);

        assert_eq!(offset, 0);
    }
}
