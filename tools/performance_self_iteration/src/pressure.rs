use std::{
    collections::BTreeMap,
    net::IpAddr,
    sync::Arc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use futures_util::{StreamExt, stream::FuturesUnordered};
use reqwest::{Client, ClientBuilder, StatusCode, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::{Mutex, Semaphore};

const MAX_ERROR_SAMPLES: usize = 100;
const CLEANUP_REQUEST_TIMEOUT_SECONDS: u64 = 5;
const MAX_RESPONSE_BODY_BYTES: usize = 64 * 1024;
const MAX_LATENCY_SAMPLES: usize = 10_000;
const MIN_SESSION_SETUP_TIMEOUT_SECONDS: u64 = 10;
const MAX_SESSION_SETUP_TIMEOUT_SECONDS: u64 = 120;

#[derive(Debug, Clone)]
pub struct PressureConfig {
    pub base_url: String,
    pub concurrency: usize,
    pub duration_seconds: u64,
    pub sessions: usize,
    pub request_timeout_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PressureReport {
    pub total_requests: usize,
    pub success_count: usize,
    pub failure_count: usize,
    pub busy_count: usize,
    pub status_counts: BTreeMap<String, usize>,
    pub latency_p50_ms: u64,
    pub latency_p95_ms: u64,
    pub latency_p99_ms: u64,
    pub latency_max_ms: u64,
    pub live_p95_ms: u64,
    pub run_count: usize,
    pub terminal_run_count: usize,
    pub failed_terminal_run_count: usize,
    pub sse_failures: usize,
    pub overloaded_response_count: usize,
    pub cleanup_failure_count: usize,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone)]
struct RequestSample {
    path: String,
    status: Option<StatusCode>,
    duration_ms: u64,
    server_busy: bool,
    error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum TerminalRunResult {
    Completed,
    Failed,
    Missing,
    MissingCleanupFailed(String),
}

#[derive(Debug, Clone)]
struct LatencyReservoir {
    values: Vec<u64>,
    seen: usize,
    max: u64,
}

#[derive(Debug, Clone)]
struct PressureAggregate {
    total_requests: usize,
    success_count: usize,
    busy_count: usize,
    status_counts: BTreeMap<String, usize>,
    latency_samples: LatencyReservoir,
    live_latency_samples: LatencyReservoir,
    run_count: usize,
    terminal_run_count: usize,
    failed_terminal_run_count: usize,
    sse_failures: usize,
    overloaded_response_count: usize,
    cleanup_failure_count: usize,
    errors: Vec<String>,
}

impl PressureReport {
    pub fn smoke() -> Self {
        Self {
            total_requests: 0,
            success_count: 0,
            failure_count: 0,
            busy_count: 0,
            status_counts: BTreeMap::new(),
            latency_p50_ms: 0,
            latency_p95_ms: 0,
            latency_p99_ms: 0,
            latency_max_ms: 0,
            live_p95_ms: 0,
            run_count: 0,
            terminal_run_count: 0,
            failed_terminal_run_count: 0,
            sse_failures: 0,
            overloaded_response_count: 0,
            cleanup_failure_count: 0,
            errors: Vec::new(),
        }
    }
}

impl LatencyReservoir {
    fn new() -> Self {
        Self {
            values: Vec::new(),
            seen: 0,
            max: 0,
        }
    }

    fn record(&mut self, value: u64) {
        self.seen += 1;
        self.max = self.max.max(value);
        if self.values.len() < MAX_LATENCY_SAMPLES {
            self.values.push(value);
            return;
        }
        let slot = deterministic_reservoir_slot(self.seen);
        if slot < MAX_LATENCY_SAMPLES {
            self.values[slot] = value;
        }
    }
}

impl PressureAggregate {
    fn new() -> Self {
        Self {
            total_requests: 0,
            success_count: 0,
            busy_count: 0,
            status_counts: BTreeMap::new(),
            latency_samples: LatencyReservoir::new(),
            live_latency_samples: LatencyReservoir::new(),
            run_count: 0,
            terminal_run_count: 0,
            failed_terminal_run_count: 0,
            sse_failures: 0,
            overloaded_response_count: 0,
            cleanup_failure_count: 0,
            errors: Vec::new(),
        }
    }

    fn record_sample(&mut self, sample: RequestSample) {
        self.total_requests += 1;
        self.latency_samples.record(sample.duration_ms);
        if sample.path == "/api/system/live" {
            self.live_latency_samples.record(sample.duration_ms);
        }
        if let Some(status) = sample.status {
            *self
                .status_counts
                .entry(status.as_u16().to_string())
                .or_insert(0) += 1;
            if status.is_success() && sample.error.is_none() {
                self.success_count += 1;
            }
            if !status.is_success() {
                push_error_sample(
                    &mut self.errors,
                    format!("{} returned {}", sample.path, status.as_u16()),
                );
            }
            if matches!(status.as_u16(), 429 | 503) || status.is_server_error() {
                self.overloaded_response_count += 1;
            }
        }
        if let Some(error) = &sample.error {
            push_error_sample(&mut self.errors, format!("{} error {error}", sample.path));
        }
        if sample.server_busy {
            self.busy_count += 1;
            push_error_sample(
                &mut self.errors,
                format!("{} returned Server is busy", sample.path),
            );
        }
    }

    fn record_terminal(&mut self, terminal: TerminalRunResult) {
        self.run_count += 1;
        match terminal {
            TerminalRunResult::Completed => self.terminal_run_count += 1,
            TerminalRunResult::Failed => self.failed_terminal_run_count += 1,
            TerminalRunResult::Missing => self.sse_failures += 1,
            TerminalRunResult::MissingCleanupFailed(error) => {
                self.sse_failures += 1;
                self.cleanup_failure_count += 1;
                push_error_sample(&mut self.errors, error.clone());
            }
        }
    }

    fn report(&self) -> PressureReport {
        PressureReport {
            total_requests: self.total_requests,
            success_count: self.success_count,
            failure_count: self.total_requests.saturating_sub(self.success_count),
            busy_count: self.busy_count,
            status_counts: self.status_counts.clone(),
            latency_p50_ms: percentile(self.latency_samples.values.clone(), 50),
            latency_p95_ms: percentile(self.latency_samples.values.clone(), 95),
            latency_p99_ms: percentile(self.latency_samples.values.clone(), 99),
            latency_max_ms: self.latency_samples.max,
            live_p95_ms: percentile(self.live_latency_samples.values.clone(), 95),
            run_count: self.run_count,
            terminal_run_count: self.terminal_run_count,
            failed_terminal_run_count: self.failed_terminal_run_count,
            sse_failures: self.sse_failures,
            overloaded_response_count: self.overloaded_response_count,
            cleanup_failure_count: self.cleanup_failure_count,
            errors: self.errors.clone(),
        }
    }

    fn merge(&mut self, other: PressureAggregate) {
        self.total_requests += other.total_requests;
        self.success_count += other.success_count;
        self.busy_count += other.busy_count;
        for (status, count) in other.status_counts {
            *self.status_counts.entry(status).or_insert(0) += count;
        }
        for value in other.latency_samples.values {
            self.latency_samples.record(value);
        }
        self.latency_samples.max = self.latency_samples.max.max(other.latency_samples.max);
        for value in other.live_latency_samples.values {
            self.live_latency_samples.record(value);
        }
        self.live_latency_samples.max = self
            .live_latency_samples
            .max
            .max(other.live_latency_samples.max);
        self.run_count += other.run_count;
        self.terminal_run_count += other.terminal_run_count;
        self.failed_terminal_run_count += other.failed_terminal_run_count;
        self.sse_failures += other.sse_failures;
        self.overloaded_response_count += other.overloaded_response_count;
        self.cleanup_failure_count += other.cleanup_failure_count;
        for error in other.errors {
            push_error_sample(&mut self.errors, error);
        }
    }
}

fn deterministic_reservoir_slot(seen: usize) -> usize {
    let mixed = (seen as u64)
        .wrapping_mul(1_103_515_245)
        .wrapping_add(12_345);
    (mixed % seen as u64) as usize
}

pub async fn run_pressure(config: PressureConfig) -> Result<PressureReport, String> {
    let client = pressure_client_builder(&config.base_url)
        .timeout(Duration::from_secs(config.request_timeout_seconds))
        .build()
        .map_err(|error| format!("failed to build http client: {error}"))?;
    let stream_client = pressure_client_builder(&config.base_url)
        .timeout(Duration::from_secs(config.request_timeout_seconds.max(75)))
        .build()
        .map_err(|error| format!("failed to build stream http client: {error}"))?;
    probe_live(&client, &config.base_url).await?;
    let setup_deadline = Instant::now() + session_setup_timeout(&config);
    let sessions =
        create_sessions(&client, &config, config.sessions, "main", setup_deadline).await?;
    let probe_sessions = match create_sessions(
        &client,
        &config,
        config.concurrency,
        "probe",
        setup_deadline,
    )
    .await
    {
        Ok(sessions) => sessions,
        Err(error) => {
            let cleanup_errors = cleanup_sessions(&client, &config.base_url, &sessions).await;
            return Err(append_cleanup_errors(error, &cleanup_errors));
        }
    };
    let aggregate = Arc::new(Mutex::new(PressureAggregate::new()));
    let semaphore = Arc::new(Semaphore::new(config.concurrency));
    let deadline = Instant::now() + Duration::from_secs(config.duration_seconds);
    let mut handles = Vec::new();

    for worker in 0..config.concurrency {
        let client = client.clone();
        let stream_client = stream_client.clone();
        let base_url = config.base_url.clone();
        let sessions = sessions.clone();
        let probe_sessions = probe_sessions.clone();
        let aggregate = Arc::clone(&aggregate);
        let semaphore = Arc::clone(&semaphore);
        handles.push(tokio::spawn(async move {
            let mut index = worker;
            let mut worker_aggregate = PressureAggregate::new();
            while Instant::now() < deadline {
                let permit = match semaphore.acquire().await {
                    Ok(permit) => permit,
                    Err(_) => break,
                };
                let session_id = &sessions[index % sessions.len()];
                let path = planned_path(session_id, index);
                let sample = send_request(&client, &base_url, &path).await;
                worker_aggregate.record_sample(sample);
                if index % 17 == 0 {
                    let probe_session_id = &probe_sessions[worker % probe_sessions.len()];
                    let terminal =
                        create_and_stream_run(&client, &stream_client, &base_url, probe_session_id)
                            .await;
                    worker_aggregate.record_terminal(terminal);
                }
                drop(permit);
                index += config.concurrency;
            }
            aggregate.lock().await.merge(worker_aggregate);
        }));
    }
    for handle in handles {
        handle
            .await
            .map_err(|error| format!("pressure worker failed: {error}"))?;
    }
    let mut report = aggregate.lock().await.report();
    let cleanup_targets = sessions
        .iter()
        .chain(probe_sessions.iter())
        .cloned()
        .collect::<Vec<_>>();
    let cleanup_errors = cleanup_sessions(&client, &config.base_url, &cleanup_targets).await;
    report.cleanup_failure_count += cleanup_errors.len();
    for error in cleanup_errors {
        push_error_sample(&mut report.errors, error);
    }
    Ok(report)
}

fn pressure_client_builder(base_url: &str) -> ClientBuilder {
    let builder = Client::builder();
    if bypass_proxy_for_target(base_url) {
        builder.no_proxy()
    } else {
        builder
    }
}

fn bypass_proxy_for_target(base_url: &str) -> bool {
    let Ok(url) = Url::parse(base_url) else {
        return false;
    };
    let Some(host) = url.host_str() else {
        return false;
    };
    if host.eq_ignore_ascii_case("localhost") {
        return true;
    }
    host.trim_matches(['[', ']'])
        .parse::<IpAddr>()
        .is_ok_and(|ip| ip.is_loopback())
}

async fn probe_live(client: &Client, base_url: &str) -> Result<(), String> {
    let url = format!("{base_url}/api/system/live");
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("backend is not reachable: {error}"))?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!("backend live probe failed: {}", response.status()))
    }
}

async fn create_sessions(
    client: &Client,
    config: &PressureConfig,
    count: usize,
    label: &str,
    setup_deadline: Instant,
) -> Result<Vec<String>, String> {
    let mut sessions = Vec::with_capacity(count);
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    for index in 0..count {
        let session_id = format!("perf-pressure-{nonce}-{label}-{index:03}");
        let remaining = match session_setup_remaining(setup_deadline) {
            Ok(remaining) => remaining,
            Err(error) => {
                return Err(cleanup_after_session_setup_error(
                    client,
                    config,
                    &sessions,
                    &[],
                    error,
                )
                .await);
            }
        };
        let request = client
            .post(format!("{}/api/sessions", config.base_url))
            .json(&serde_json::json!({
                "workspace_id": "default",
                "session_id": &session_id,
            }))
            .send();
        let response = match tokio::time::timeout(remaining, request).await {
            Ok(Ok(response)) => response,
            Ok(Err(error)) => {
                return Err(cleanup_after_session_setup_error(
                    client,
                    config,
                    &sessions,
                    std::slice::from_ref(&session_id),
                    format!("failed to create session: {error}"),
                )
                .await);
            }
            Err(_) => {
                return Err(cleanup_after_session_setup_error(
                    client,
                    config,
                    &sessions,
                    std::slice::from_ref(&session_id),
                    "session setup timed out".to_owned(),
                )
                .await);
            }
        };
        if !response.status().is_success() {
            return Err(cleanup_after_session_setup_error(
                client,
                config,
                &sessions,
                std::slice::from_ref(&session_id),
                format!("session create failed: {}", response.status()),
            )
            .await);
        }
        sessions.push(session_id);
        let remaining = match session_setup_remaining(setup_deadline) {
            Ok(remaining) => remaining,
            Err(error) => {
                return Err(cleanup_after_session_setup_error(
                    client,
                    config,
                    &sessions,
                    &[],
                    error,
                )
                .await);
            }
        };
        let payload = match tokio::time::timeout(remaining, bounded_response_json(response)).await {
            Ok(Ok(payload)) => payload,
            Ok(Err(error)) => {
                return Err(cleanup_after_session_setup_error(
                    client,
                    config,
                    &sessions,
                    &[],
                    format!("invalid session response: {error}"),
                )
                .await);
            }
            Err(_) => {
                return Err(cleanup_after_session_setup_error(
                    client,
                    config,
                    &sessions,
                    &[],
                    "session setup timed out while reading response".to_owned(),
                )
                .await);
            }
        };
        let Some(id) = payload.get("session_id").and_then(Value::as_str) else {
            return Err(cleanup_after_session_setup_error(
                client,
                config,
                &sessions,
                &[],
                "session response missing session_id".to_owned(),
            )
            .await);
        };
        if let Err(error) = validate_pressure_session_id(sessions.last().map(String::as_str), id) {
            let returned_sessions =
                returned_pressure_session_cleanup_ids(sessions.last().map(String::as_str), id);
            return Err(cleanup_after_session_setup_error(
                client,
                config,
                &sessions,
                &returned_sessions,
                error,
            )
            .await);
        }
    }
    Ok(sessions)
}

fn session_setup_timeout(config: &PressureConfig) -> Duration {
    let seconds = config.request_timeout_seconds.saturating_mul(2).clamp(
        MIN_SESSION_SETUP_TIMEOUT_SECONDS,
        MAX_SESSION_SETUP_TIMEOUT_SECONDS,
    );
    Duration::from_secs(seconds)
}

fn session_setup_remaining(setup_deadline: Instant) -> Result<Duration, String> {
    let Some(remaining) = setup_deadline.checked_duration_since(Instant::now()) else {
        return Err("session setup deadline elapsed".to_owned());
    };
    if remaining.is_zero() {
        Err("session setup deadline elapsed".to_owned())
    } else {
        Ok(remaining)
    }
}

fn validate_pressure_session_id(expected: Option<&str>, actual: &str) -> Result<(), String> {
    let Some(expected) = expected else {
        return Err("session tracking failed".to_owned());
    };
    if actual == expected {
        Ok(())
    } else {
        Err(format!(
            "session response id mismatch: expected generated pressure session {expected}, got {actual}"
        ))
    }
}

async fn cleanup_after_session_setup_error(
    client: &Client,
    config: &PressureConfig,
    sessions: &[String],
    extra_sessions: &[String],
    error: String,
) -> String {
    let cleanup_targets = session_cleanup_targets(sessions, extra_sessions);
    let cleanup_errors = cleanup_sessions(client, &config.base_url, &cleanup_targets).await;
    append_cleanup_errors(error, &cleanup_errors)
}

fn returned_pressure_session_cleanup_ids(expected: Option<&str>, actual: &str) -> Vec<String> {
    if expected == Some(actual) || !is_pressure_session_id(actual) {
        return Vec::new();
    }
    vec![actual.to_owned()]
}

fn session_cleanup_targets(sessions: &[String], extra_sessions: &[String]) -> Vec<String> {
    let mut targets = sessions.to_vec();
    for session_id in extra_sessions {
        if !targets.iter().any(|target| target == session_id) {
            targets.push(session_id.clone());
        }
    }
    targets
}

fn append_cleanup_errors(mut error: String, cleanup_errors: &[String]) -> String {
    if cleanup_errors.is_empty() {
        return error;
    }
    error.push_str("; cleanup errors: ");
    error.push_str(&cleanup_errors.join("; "));
    error
}

fn planned_path(session_id: &str, index: usize) -> String {
    match index % 10 {
        0 => "/api/system/live".to_owned(),
        1 => "/api/system/health".to_owned(),
        2 => "/api/sessions".to_owned(),
        3 => format!("/api/sessions/{session_id}"),
        4 => format!("/api/sessions/{session_id}/rounds?summary=true&limit=4"),
        5 => format!("/api/sessions/{session_id}/rounds?limit=8"),
        6 => format!("/api/sessions/{session_id}/recovery"),
        7 => format!("/api/sessions/{session_id}/token-usage"),
        8 => format!("/api/sessions/{session_id}/agents"),
        _ => format!("/api/sessions/{session_id}/tasks"),
    }
}

async fn send_request(client: &Client, base_url: &str, path: &str) -> RequestSample {
    let started = Instant::now();
    let response = client.get(format!("{base_url}{path}")).send().await;
    match response {
        Ok(response) => {
            let status = response.status();
            let body_result = bounded_response_body_contains(response, "Server is busy").await;
            let error = body_result.as_ref().err().cloned();
            let server_busy = body_result.unwrap_or(false);
            RequestSample {
                path: path.to_owned(),
                status: Some(status),
                duration_ms: started.elapsed().as_millis() as u64,
                server_busy,
                error,
            }
        }
        Err(error) => RequestSample {
            path: path.to_owned(),
            status: None,
            duration_ms: started.elapsed().as_millis() as u64,
            server_busy: false,
            error: Some(error.to_string()),
        },
    }
}

async fn bounded_response_body_contains(
    response: reqwest::Response,
    needle: &str,
) -> Result<bool, String> {
    let mut stream = response.bytes_stream();
    let mut body = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| error.to_string())?;
        let remaining = MAX_RESPONSE_BODY_BYTES.saturating_sub(body.len());
        if chunk.len() > remaining {
            return Err(format!(
                "response body exceeds {} bytes",
                MAX_RESPONSE_BODY_BYTES
            ));
        }
        body.extend_from_slice(&chunk);
    }
    Ok(String::from_utf8_lossy(&body).contains(needle))
}

async fn bounded_response_json(response: reqwest::Response) -> Result<Value, String> {
    bounded_response_json_with_prefix(response)
        .await
        .map_err(|error| error.message)
}

struct BoundedJsonError {
    message: String,
    prefix: Vec<u8>,
}

async fn bounded_response_json_with_prefix(
    response: reqwest::Response,
) -> Result<Value, BoundedJsonError> {
    let mut stream = response.bytes_stream();
    let mut body = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| BoundedJsonError {
            message: error.to_string(),
            prefix: body.clone(),
        })?;
        let remaining = MAX_RESPONSE_BODY_BYTES.saturating_sub(body.len());
        if chunk.len() > remaining {
            body.extend_from_slice(&chunk[..remaining]);
            return Err(BoundedJsonError {
                message: format!("response body exceeds {} bytes", MAX_RESPONSE_BODY_BYTES),
                prefix: body,
            });
        }
        body.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&body).map_err(|error| BoundedJsonError {
        message: error.to_string(),
        prefix: body,
    })
}

async fn create_and_stream_run(
    client: &Client,
    stream_client: &Client,
    base_url: &str,
    session_id: &str,
) -> TerminalRunResult {
    let Ok(response) = client
        .post(format!("{base_url}/api/runs"))
        .json(&probe_run_payload(session_id))
        .send()
        .await
    else {
        return TerminalRunResult::Missing;
    };
    if !response.status().is_success() {
        return missing_after_failed_create_response(client, base_url, response).await;
    }
    let payload = match bounded_response_json_with_prefix(response).await {
        Ok(payload) => payload,
        Err(error) => {
            if let Some(run_id) = extract_json_string_field_prefix(&error.prefix, "run_id") {
                return missing_after_stop(client, base_url, &run_id).await;
            }
            return TerminalRunResult::Missing;
        }
    };
    let Some(run_id) = payload.get("run_id").and_then(Value::as_str) else {
        return TerminalRunResult::Missing;
    };
    let Ok(response) = stream_client
        .get(format!("{base_url}/api/runs/{run_id}/events"))
        .header("accept", "text/event-stream")
        .send()
        .await
    else {
        return missing_after_stop(client, base_url, run_id).await;
    };
    if !response.status().is_success() {
        return missing_after_stop(client, base_url, run_id).await;
    }
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let deadline = Instant::now() + Duration::from_secs(60);
    loop {
        if Instant::now() > deadline {
            return missing_after_stop(client, base_url, run_id).await;
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        let chunk = match tokio::time::timeout(remaining, stream.next()).await {
            Ok(Some(chunk)) => chunk,
            Ok(None) => return missing_after_stop(client, base_url, run_id).await,
            Err(_) => return missing_after_stop(client, base_url, run_id).await,
        };
        let Ok(chunk) = chunk else {
            return missing_after_stop(client, base_url, run_id).await;
        };
        let remaining_buffer_bytes = MAX_RESPONSE_BODY_BYTES.saturating_sub(buffer.len());
        if chunk.len() > remaining_buffer_bytes {
            return missing_after_stop(client, base_url, run_id).await;
        }
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        if let Some(result) = terminal_probe_result(&buffer) {
            return result;
        }
        if buffer.len() > 64 * 1024 {
            buffer = buffer
                .chars()
                .rev()
                .take(32 * 1024)
                .collect::<String>()
                .chars()
                .rev()
                .collect();
        }
    }
}

async fn missing_after_failed_create_response(
    client: &Client,
    base_url: &str,
    response: reqwest::Response,
) -> TerminalRunResult {
    match bounded_response_json_with_prefix(response).await {
        Ok(payload) => match payload.get("run_id").and_then(Value::as_str) {
            Some(run_id) => missing_after_stop(client, base_url, run_id).await,
            None => TerminalRunResult::Missing,
        },
        Err(error) => match extract_json_string_field_prefix(&error.prefix, "run_id") {
            Some(run_id) => missing_after_stop(client, base_url, &run_id).await,
            None => TerminalRunResult::Missing,
        },
    }
}

fn terminal_probe_result(buffer: &str) -> Option<TerminalRunResult> {
    if has_event_type(buffer, "run_failed") || has_event_type(buffer, "run_stopped") {
        Some(TerminalRunResult::Failed)
    } else if has_event_type(buffer, "run_completed") {
        Some(TerminalRunResult::Completed)
    } else {
        None
    }
}

fn has_event_type(buffer: &str, event_type: &str) -> bool {
    buffer.contains(&format!("\"event_type\":\"{event_type}\""))
        || buffer.contains(&format!("\"event_type\": \"{event_type}\""))
}

fn extract_json_string_field_prefix(prefix: &[u8], field: &str) -> Option<String> {
    let text = String::from_utf8_lossy(prefix);
    let key = format!("\"{field}\"");
    let start = text.find(&key)? + key.len();
    let rest = text[start..].trim_start();
    let rest = rest.strip_prefix(':')?.trim_start();
    let mut chars = rest.strip_prefix('"')?.chars();
    let mut value = String::new();
    let mut escaped = false;
    for character in &mut chars {
        if escaped {
            value.push(character);
            escaped = false;
        } else if character == '\\' {
            escaped = true;
        } else if character == '"' {
            return Some(value);
        } else {
            value.push(character);
        }
    }
    None
}

fn probe_run_payload(session_id: &str) -> serde_json::Value {
    serde_json::json!({
        "session_id": session_id,
        "input": [{"kind": "text", "text": "[sse-liveness] pressure probe"}],
        "execution_mode": "manual",
        "yolo": false,
    })
}

async fn missing_after_stop(client: &Client, base_url: &str, run_id: &str) -> TerminalRunResult {
    match stop_probe_run(client, base_url, run_id).await {
        Ok(()) => TerminalRunResult::Missing,
        Err(error) => TerminalRunResult::MissingCleanupFailed(error),
    }
}

async fn stop_probe_run(client: &Client, base_url: &str, run_id: &str) -> Result<(), String> {
    let response = client
        .post(stop_run_url(base_url, run_id))
        .json(&stop_run_payload())
        .send()
        .await
        .map_err(|error| format!("stop pressure run {run_id} error {error}"))?;
    if response.status().is_success() || response.status() == StatusCode::NOT_FOUND {
        Ok(())
    } else {
        Err(format!(
            "stop pressure run {run_id} returned {}",
            response.status().as_u16()
        ))
    }
}

fn stop_run_url(base_url: &str, run_id: &str) -> String {
    format!("{base_url}/api/runs/{run_id}/stop")
}

fn stop_run_payload() -> serde_json::Value {
    serde_json::json!({
        "scope": "main",
    })
}

async fn cleanup_sessions(client: &Client, base_url: &str, sessions: &[String]) -> Vec<String> {
    let mut errors = Vec::new();
    let mut pending = FuturesUnordered::new();
    for session_id in sessions.iter().cloned() {
        pending.push(cleanup_session(
            client.clone(),
            base_url.to_owned(),
            session_id,
        ));
    }
    while let Some(result) = pending.next().await {
        if let Some(error) = result {
            errors.push(error);
        }
    }
    errors
}

async fn cleanup_session(client: Client, base_url: String, session_id: String) -> Option<String> {
    if !is_pressure_session_id(&session_id) {
        return Some(format!(
            "skipped cleanup for non-pressure session id {session_id}"
        ));
    }
    let request = client
        .delete(format!("{base_url}/api/sessions/{session_id}"))
        .json(&session_delete_payload())
        .send();
    match tokio::time::timeout(
        Duration::from_secs(CLEANUP_REQUEST_TIMEOUT_SECONDS),
        request,
    )
    .await
    {
        Ok(Ok(response))
            if response.status().is_success() || response.status() == StatusCode::NOT_FOUND =>
        {
            None
        }
        Ok(Ok(response)) => Some(format!(
            "cleanup session {session_id} returned {}",
            response.status().as_u16()
        )),
        Ok(Err(error)) => Some(format!("cleanup session {session_id} error {error}")),
        Err(_) => Some(format!(
            "cleanup session {session_id} timed out after {CLEANUP_REQUEST_TIMEOUT_SECONDS}s"
        )),
    }
}

fn is_pressure_session_id(session_id: &str) -> bool {
    session_id.starts_with("perf-pressure-")
}

fn session_delete_payload() -> serde_json::Value {
    serde_json::json!({
        "force": true,
        "cascade": true,
    })
}

#[cfg(test)]
fn build_report(samples: &[RequestSample], terminals: &[TerminalRunResult]) -> PressureReport {
    let mut aggregate = PressureAggregate::new();
    for sample in samples {
        aggregate.record_sample(sample.clone());
    }
    for terminal in terminals {
        aggregate.record_terminal(terminal.clone());
    }
    aggregate.report()
}

fn push_error_sample(errors: &mut Vec<String>, error: String) {
    if errors.len() < MAX_ERROR_SAMPLES {
        errors.push(error);
    }
}

fn percentile(mut values: Vec<u64>, percentile: usize) -> u64 {
    if values.is_empty() {
        return 0;
    }
    values.sort_unstable();
    let index = ((values.len() * percentile).div_ceil(100)).saturating_sub(1);
    values[index.min(values.len() - 1)]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };

    #[test]
    fn percentile_handles_empty_and_non_empty() {
        assert_eq!(percentile(Vec::new(), 95), 0);
        assert_eq!(percentile(vec![10, 1, 5, 20], 50), 5);
        assert_eq!(percentile(vec![10, 1, 5, 20], 95), 20);
    }

    #[test]
    fn failed_sse_probes_count_against_terminal_ratio() {
        let report = build_report(
            &[],
            &[TerminalRunResult::Completed, TerminalRunResult::Missing],
        );
        assert_eq!(report.run_count, 2);
        assert_eq!(report.terminal_run_count, 1);
        assert_eq!(report.sse_failures, 1);
    }

    #[test]
    fn failed_probe_stop_is_reported_as_cleanup_failure() {
        let report = build_report(
            &[],
            &[TerminalRunResult::MissingCleanupFailed(
                "stop pressure run run-1 returned 500".to_owned(),
            )],
        );

        assert_eq!(report.run_count, 1);
        assert_eq!(report.sse_failures, 1);
        assert_eq!(report.cleanup_failure_count, 1);
        assert!(
            report
                .errors
                .iter()
                .any(|error| error.contains("stop pressure run run-1"))
        );
    }

    #[test]
    fn failed_terminal_runs_are_counted_separately() {
        let report = build_report(
            &[],
            &[
                TerminalRunResult::Completed,
                TerminalRunResult::Failed,
                TerminalRunResult::Missing,
            ],
        );

        assert_eq!(report.run_count, 3);
        assert_eq!(report.terminal_run_count, 1);
        assert_eq!(report.failed_terminal_run_count, 1);
        assert_eq!(report.sse_failures, 1);
    }

    #[test]
    fn overloaded_statuses_are_counted() {
        let report = build_report(
            &[
                RequestSample {
                    path: "/api/system/live".to_owned(),
                    status: Some(StatusCode::TOO_MANY_REQUESTS),
                    duration_ms: 1,
                    server_busy: false,
                    error: None,
                },
                RequestSample {
                    path: "/api/system/health".to_owned(),
                    status: Some(StatusCode::INTERNAL_SERVER_ERROR),
                    duration_ms: 2,
                    server_busy: false,
                    error: None,
                },
            ],
            &[],
        );
        assert_eq!(report.overloaded_response_count, 2);
        assert_eq!(report.errors.len(), 2);
    }

    #[test]
    fn pressure_error_samples_are_bounded() {
        let samples = (0..(MAX_ERROR_SAMPLES + 25))
            .map(|index| RequestSample {
                path: format!("/api/overloaded/{index}"),
                status: Some(StatusCode::SERVICE_UNAVAILABLE),
                duration_ms: 1,
                server_busy: false,
                error: None,
            })
            .collect::<Vec<_>>();

        let report = build_report(&samples, &[]);

        assert_eq!(report.overloaded_response_count, MAX_ERROR_SAMPLES + 25);
        assert_eq!(report.errors.len(), MAX_ERROR_SAMPLES);
    }

    #[test]
    fn latency_samples_are_bounded_while_counts_continue() {
        let mut aggregate = PressureAggregate::new();
        for index in 0..(MAX_LATENCY_SAMPLES + 250) {
            aggregate.record_sample(RequestSample {
                path: "/api/system/health".to_owned(),
                status: Some(StatusCode::OK),
                duration_ms: index as u64,
                server_busy: false,
                error: None,
            });
        }
        let report = aggregate.report();

        assert_eq!(report.total_requests, MAX_LATENCY_SAMPLES + 250);
        assert_eq!(report.success_count, MAX_LATENCY_SAMPLES + 250);
        assert_eq!(aggregate.latency_samples.values.len(), MAX_LATENCY_SAMPLES);
        assert_eq!(report.latency_max_ms, (MAX_LATENCY_SAMPLES + 249) as u64);
    }

    #[test]
    fn non_success_client_statuses_are_failures() {
        let report = build_report(
            &[RequestSample {
                path: "/api/sessions/missing".to_owned(),
                status: Some(StatusCode::NOT_FOUND),
                duration_ms: 1,
                server_busy: false,
                error: None,
            }],
            &[],
        );

        assert_eq!(report.success_count, 0);
        assert_eq!(report.failure_count, 1);
        assert!(report.errors.iter().any(|error| error.contains("404")));
    }

    #[test]
    fn body_read_errors_count_as_failures() {
        let report = build_report(
            &[RequestSample {
                path: "/api/system/live".to_owned(),
                status: Some(StatusCode::OK),
                duration_ms: 1,
                server_busy: false,
                error: Some("body timeout".to_owned()),
            }],
            &[],
        );

        assert_eq!(report.success_count, 0);
        assert_eq!(report.failure_count, 1);
        assert!(
            report
                .errors
                .iter()
                .any(|error| error.contains("body timeout"))
        );
    }

    #[test]
    fn server_busy_detection_does_not_store_response_body() {
        let report = build_report(
            &[RequestSample {
                path: "/api/sessions".to_owned(),
                status: Some(StatusCode::OK),
                duration_ms: 1,
                server_busy: true,
                error: None,
            }],
            &[],
        );

        assert_eq!(report.busy_count, 1);
        assert!(
            report
                .errors
                .iter()
                .any(|error| error.contains("Server is busy"))
        );
    }

    #[test]
    fn session_cleanup_requests_force_cascade_delete() {
        assert_eq!(
            session_delete_payload(),
            serde_json::json!({"force": true, "cascade": true})
        );
    }

    #[test]
    fn cleanup_is_scoped_to_pressure_session_ids() {
        assert!(is_pressure_session_id("perf-pressure-123-000"));
        assert!(!is_pressure_session_id("session-user-owned"));
    }

    #[test]
    fn session_response_must_match_generated_pressure_id() {
        assert!(
            validate_pressure_session_id(Some("perf-pressure-1-000"), "perf-pressure-1-000")
                .is_ok()
        );
        assert!(
            validate_pressure_session_id(Some("perf-pressure-1-000"), "session-user-owned")
                .unwrap_err()
                .contains("mismatch")
        );
    }

    #[test]
    fn sse_probe_run_payload_is_non_mutating_manual_mode() {
        assert_eq!(
            probe_run_payload("perf-pressure-1-000"),
            serde_json::json!({
                "session_id": "perf-pressure-1-000",
                "input": [{"kind": "text", "text": "[sse-liveness] pressure probe"}],
                "execution_mode": "manual",
                "yolo": false,
            })
        );
    }

    #[test]
    fn sse_probe_requires_terminal_events() {
        assert_eq!(
            terminal_probe_result(r#"data: {"event_type":"run_started"}"#),
            None
        );
        assert_eq!(
            terminal_probe_result(r#"data: {"event_type":"run_failed"}"#),
            Some(TerminalRunResult::Failed)
        );
        assert_eq!(
            terminal_probe_result(r#"data: {"event_type":"run_stopped"}"#),
            Some(TerminalRunResult::Failed)
        );
        assert_eq!(
            terminal_probe_result(r#"data: {"event_type":"run_completed"}"#),
            Some(TerminalRunResult::Completed)
        );
    }

    #[test]
    fn json_prefix_extractor_reads_string_fields() {
        assert_eq!(
            extract_json_string_field_prefix(br#"{"run_id":"run-1","tail":"#, "run_id"),
            Some("run-1".to_owned())
        );
        assert_eq!(
            extract_json_string_field_prefix(br#"{"other":"run-1"}"#, "run_id"),
            None
        );
    }

    #[tokio::test]
    async fn bounded_response_json_rejects_large_body() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut buffer = vec![0; 1024];
            let _ = stream.read(&mut buffer).await.unwrap();
            let body = format!(
                r#"{{"session_id":"{}"}}"#,
                "x".repeat(MAX_RESPONSE_BODY_BYTES)
            );
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });

        let response = Client::new().get(url).send().await.unwrap();
        let error = bounded_response_json(response).await.unwrap_err();
        server.await.unwrap();

        assert!(error.contains("response body exceeds"));
    }

    #[tokio::test]
    async fn bounded_response_body_contains_rejects_large_body() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut buffer = vec![0; 1024];
            let _ = stream.read(&mut buffer).await.unwrap();
            let body = "x".repeat(MAX_RESPONSE_BODY_BYTES + 1);
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: text/plain\r\ncontent-length: {}\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });

        let response = Client::new().get(url).send().await.unwrap();
        let error = bounded_response_body_contains(response, "Server is busy")
            .await
            .unwrap_err();
        server.await.unwrap();

        assert!(error.contains("response body exceeds"));
    }

    #[tokio::test]
    async fn failed_session_create_cleans_generated_session_id() {
        let cleanup_requests = Arc::new(AtomicUsize::new(0));
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let cleanup_requests_for_server = Arc::clone(&cleanup_requests);
        let server = tokio::spawn(async move {
            loop {
                let (mut stream, _) = listener.accept().await.unwrap();
                let cleanup_requests_for_connection = Arc::clone(&cleanup_requests_for_server);
                tokio::spawn(async move {
                    let mut buffer = vec![0; 4096];
                    let read = stream.read(&mut buffer).await.unwrap();
                    let request = String::from_utf8_lossy(&buffer[..read]);
                    let body = if request.starts_with("POST /api/sessions ") {
                        "session rejected"
                    } else if request.starts_with("DELETE /api/sessions/perf-pressure-") {
                        cleanup_requests_for_connection.fetch_add(1, Ordering::SeqCst);
                        ""
                    } else {
                        "unexpected request"
                    };
                    let status = if request.starts_with("POST /api/sessions ") {
                        "500 Internal Server Error"
                    } else if request.starts_with("DELETE /api/sessions/perf-pressure-") {
                        "204 No Content"
                    } else {
                        "404 Not Found"
                    };
                    let response = format!(
                        "HTTP/1.1 {status}\r\nconnection: close\r\ncontent-length: {}\r\n\r\n{}",
                        body.len(),
                        body
                    );
                    stream.write_all(response.as_bytes()).await.unwrap();
                });
            }
        });

        let config = PressureConfig {
            base_url,
            concurrency: 1,
            duration_seconds: 1,
            sessions: 1,
            request_timeout_seconds: 1,
        };
        let error = create_sessions(
            &Client::new(),
            &config,
            1,
            "main",
            Instant::now() + Duration::from_secs(5),
        )
        .await
        .unwrap_err();
        server.abort();

        assert!(error.contains("session create failed"));
        assert_eq!(cleanup_requests.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn oversized_probe_create_response_stops_extracted_run_id() {
        let stop_requests = Arc::new(AtomicUsize::new(0));
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let stop_requests_for_server = Arc::clone(&stop_requests);
        let server = tokio::spawn(async move {
            loop {
                let Ok((mut stream, _)) = listener.accept().await else {
                    return;
                };
                let stop_requests_for_connection = Arc::clone(&stop_requests_for_server);
                tokio::spawn(async move {
                    let mut buffer = vec![0; 4096];
                    let Ok(read) = stream.read(&mut buffer).await else {
                        return;
                    };
                    let request = String::from_utf8_lossy(&buffer[..read]);
                    let (status, body) = if request.starts_with("POST /api/runs ") {
                        (
                            "200 OK",
                            format!(
                                r#"{{"run_id":"run-oversized","padding":"{}"}}"#,
                                "x".repeat(MAX_RESPONSE_BODY_BYTES)
                            ),
                        )
                    } else if request.starts_with("POST /api/runs/run-oversized/stop ") {
                        stop_requests_for_connection.fetch_add(1, Ordering::SeqCst);
                        ("200 OK", "{}".to_owned())
                    } else {
                        ("404 Not Found", "{}".to_owned())
                    };
                    let response = format!(
                        "HTTP/1.1 {status}\r\nconnection: close\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n{}",
                        body.len(),
                        body
                    );
                    stream.write_all(response.as_bytes()).await.unwrap();
                });
            }
        });

        let result = create_and_stream_run(
            &Client::new(),
            &Client::new(),
            &base_url,
            "perf-pressure-1-000",
        )
        .await;
        server.abort();

        assert_eq!(result, TerminalRunResult::Missing);
        assert_eq!(stop_requests.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn failed_probe_create_response_stops_returned_run_id() {
        let stop_requests = Arc::new(AtomicUsize::new(0));
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let stop_requests_for_server = Arc::clone(&stop_requests);
        let server = tokio::spawn(async move {
            loop {
                let Ok((mut stream, _)) = listener.accept().await else {
                    return;
                };
                let stop_requests_for_connection = Arc::clone(&stop_requests_for_server);
                tokio::spawn(async move {
                    let mut buffer = vec![0; 4096];
                    let Ok(read) = stream.read(&mut buffer).await else {
                        return;
                    };
                    let request = String::from_utf8_lossy(&buffer[..read]);
                    let (status, body) = if request.starts_with("POST /api/runs ") {
                        (
                            "500 Internal Server Error",
                            r#"{"run_id":"run-created","error":"queued then failed"}"#,
                        )
                    } else if request.starts_with("POST /api/runs/run-created/stop ") {
                        stop_requests_for_connection.fetch_add(1, Ordering::SeqCst);
                        ("200 OK", "{}")
                    } else {
                        ("404 Not Found", "{}")
                    };
                    let response = format!(
                        "HTTP/1.1 {status}\r\nconnection: close\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n{}",
                        body.len(),
                        body
                    );
                    let _ = stream.write_all(response.as_bytes()).await;
                });
            }
        });
        let client = Client::builder().no_proxy().build().unwrap();
        let stream_client = Client::builder().no_proxy().build().unwrap();

        let result =
            create_and_stream_run(&client, &stream_client, &base_url, "perf-pressure-1-000").await;
        server.abort();

        assert_eq!(result, TerminalRunResult::Missing);
        assert_eq!(stop_requests.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn sse_probe_does_not_stop_naturally_completed_runs() {
        let stop_requests = Arc::new(AtomicUsize::new(0));
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let stop_requests_for_server = Arc::clone(&stop_requests);
        let server = tokio::spawn(async move {
            loop {
                let Ok((mut stream, _)) = listener.accept().await else {
                    return;
                };
                let stop_requests_for_connection = Arc::clone(&stop_requests_for_server);
                tokio::spawn(async move {
                    let mut buffer = vec![0; 4096];
                    let Ok(read) = stream.read(&mut buffer).await else {
                        return;
                    };
                    let request = String::from_utf8_lossy(&buffer[..read]);
                    let body = if request.starts_with("POST /api/runs ") {
                        r#"{"run_id":"run-1"}"#
                    } else if request.starts_with("GET /api/runs/run-1/events ") {
                        r#"data: {"event_type":"run_completed"}\n\n"#
                    } else if request.starts_with("POST /api/runs/run-1/stop ") {
                        stop_requests_for_connection.fetch_add(1, Ordering::SeqCst);
                        r#"{"stopped":true}"#
                    } else {
                        r#"{"error":"unexpected request"}"#
                    };
                    let response = format!(
                        "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n{}",
                        body.len(),
                        body
                    );
                    let _ = stream.write_all(response.as_bytes()).await;
                });
            }
        });
        let client = Client::builder().no_proxy().build().unwrap();
        let stream_client = Client::builder().no_proxy().build().unwrap();

        let result =
            create_and_stream_run(&client, &stream_client, &base_url, "perf-pressure-1-000").await;
        server.abort();

        assert_eq!(result, TerminalRunResult::Completed);
        assert_eq!(stop_requests.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn missing_probe_stop_request_targets_main_run() {
        assert_eq!(
            stop_run_url("http://127.0.0.1:8080", "run-123"),
            "http://127.0.0.1:8080/api/runs/run-123/stop"
        );
        assert_eq!(stop_run_payload(), serde_json::json!({"scope": "main"}));
    }

    #[test]
    fn session_setup_errors_include_cleanup_failures() {
        let error = append_cleanup_errors(
            "session create failed: 500 Internal Server Error".to_owned(),
            &["cleanup session perf-pressure-1 returned 409".to_owned()],
        );

        assert!(error.contains("session create failed"));
        assert!(error.contains("cleanup errors"));
        assert!(error.contains("409"));
    }

    #[test]
    fn session_setup_timeout_is_bounded() {
        let config = PressureConfig {
            base_url: "http://127.0.0.1:8080".to_owned(),
            concurrency: 100,
            duration_seconds: 5,
            sessions: 20,
            request_timeout_seconds: 30,
        };
        let slow_config = PressureConfig {
            request_timeout_seconds: 300,
            ..config.clone()
        };

        assert_eq!(session_setup_timeout(&config), Duration::from_secs(60));
        assert_eq!(
            session_setup_timeout(&slow_config),
            Duration::from_secs(MAX_SESSION_SETUP_TIMEOUT_SECONDS)
        );
    }

    #[test]
    fn mismatch_cleanup_targets_include_returned_pressure_session() {
        let requested = vec!["perf-pressure-1-main-000".to_owned()];
        let returned = returned_pressure_session_cleanup_ids(
            Some("perf-pressure-1-main-000"),
            "perf-pressure-1-main-other",
        );
        let targets = session_cleanup_targets(&requested, &returned);

        assert_eq!(
            targets,
            vec![
                "perf-pressure-1-main-000".to_owned(),
                "perf-pressure-1-main-other".to_owned()
            ]
        );
    }

    #[test]
    fn proxy_is_bypassed_only_for_loopback_targets() {
        assert!(bypass_proxy_for_target("http://127.0.0.1:8000"));
        assert!(bypass_proxy_for_target("http://[::1]:8000"));
        assert!(bypass_proxy_for_target("http://localhost:8000"));
        assert!(!bypass_proxy_for_target("https://benchmark.example.test"));
    }
}
