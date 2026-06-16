# API Session List Hang Investigation, 2026-06-16

## Summary

2026-06-16 对目标 relay-teams 虚拟机做只读排查时，确认 `/api/sessions/sidebar` 和 `/api/automation/projects` 卡住的共同路径是完整 session 列表投影刷新。

`/api/sessions/sidebar` 直接调用 `SessionService.list_sessions_async()`。`/api/automation/projects` 即使 `automation_projects` 当前为空，也会在返回项目数据前调用 session 列表逻辑，因此被同一个慢查询链路拖住。

本次排查没有修改远端代码或数据库文件。

## Affected Paths

- `src/relay_teams/interfaces/server/routers/sessions.py`
  - `/api/sessions/sidebar`
  - `session.list.sidebar`
- `src/relay_teams/interfaces/server/routers/automation.py`
  - `/api/automation/projects`
- `src/relay_teams/automation/automation_service.py`
  - `AutomationService.list_projects_async()`
  - 先读取 automation projects，再调用 session list。
- `src/relay_teams/sessions/session_service.py`
  - `SessionService.list_sessions()`
  - `SessionService.list_sessions_async()`
- `src/relay_teams/sessions/runs/event_log.py`
  - `EventLog.list_by_run_ids_event_types()`

## Data Snapshot

只读检查时的主要数据量如下：

| Item | Value |
| --- | ---: |
| `relay_teams.db` | about 17 GB |
| `relay_teams.db-wal` | about 1.6 GB |
| `sessions` | 5,382 rows |
| `run_runtime` | 5,438 rows |
| latest terminal run ids | 5,368 |
| `events` | 14,815,080 rows |
| `messages` | 182,439 rows |
| `metric_points` | 689,879 rows |
| `automation_projects` | 0 rows |

`automation_projects` 为空，说明 `/api/automation/projects` 卡住不是项目表本身造成的，而是后续 session projection 造成的。

## Evidence

后台日志显示 session list 投影刷新发生过分钟级阻塞：

| Log Time, UTC | Local Time, Asia/Shanghai | Operation | Duration |
| --- | --- | --- | ---: |
| 2026-06-16T02:03:52Z | 2026-06-16 10:03:52 | `session_projection_refresh`, `session_list` | 1,129,388 ms |
| 2026-06-16T02:03:52Z | 2026-06-16 10:03:52 | `session_fast_read`, `session.list.sidebar` | 1,129,445 ms |
| 2026-06-16T02:16:34Z | 2026-06-16 10:16:34 | `session_projection_refresh`, `session_list` | 1,862,962 ms |
| 2026-06-16T02:16:34Z | 2026-06-16 10:16:34 | `session_fast_read`, `session.list.sidebar` | 1,863,031 ms |

日志中没有观察到 `database is locked` 或 `server.route_work.rejected`，因此更像读侧大查询和 I/O 等待，而不是典型写锁堵塞或 route worker 队列拒绝。

## Slow Query Area

`SessionService.list_sessions()` 会依次读取：

- all sessions
- run runtimes by session ids
- background tasks by session ids
- run intents by session ids
- first user messages, only when intent title missing
- agent instances by session ids
- latest terminal run verification status
- approval and user-question counts

分段只读计时显示，大部分步骤不是主瓶颈：

| Step | Observed Time |
| --- | ---: |
| `sessions.list_all` | about 119 ms |
| `run_runtime.list_by_session_ids` | about 125 ms total |
| `background_tasks.list_by_session_ids` | about 57 ms total |
| `run_intents.first_titles_by_session_ids` | about 625 ms total |
| `messages.first_user_messages_by_session_ids` | 0 ms, no fallback needed |
| `agent_instances.list_by_session_ids` | about 4.2 s total |
| `events` verification chunks | one 898-run chunk exceeded 30 s during cold read |

最可疑的查询是 latest terminal run verification status：

```sql
SELECT id, event_type, trace_id, session_id, task_id, instance_id, payload_json, occurred_at
FROM events
WHERE trace_id IN (...)
  AND event_type IN ('run_completed', 'run_failed')
ORDER BY id ASC
```

查询计划显示：

```text
SEARCH events USING INDEX idx_events_trace (trace_id=?)
USE TEMP B-TREE FOR ORDER BY
```

当前 `events` 相关索引包括：

- `idx_events_trace(trace_id)`
- `idx_events_trace_id(trace_id, id)`
- `idx_events_session(session_id)`
- `idx_events_session_id_trace(session_id, id, trace_id)`
- `idx_events_session_event_type_id(session_id, event_type, id)`
- `idx_events_session_trace_event_id(session_id, trace_id, event_type, id)`

但是缺少能直接覆盖当前查询形态的 `(trace_id, event_type, id)` 索引。实际执行时会按 `trace_id` 读取大量事件，再过滤 `event_type`，并为 `ORDER BY id ASC` 建临时排序结构。

对同一个慢分片拆成 100-run 小片后，小片能在约 120 ms 到 2.8 s 内完成；预热后完整 898-run 分片约 1.3 s 返回。这说明问题不是单条 run 数据稳定卡死，而是大 IN 查询在冷缓存、巨大 `events` 表和磁盘页面等待下被放大。

## Database Health Signal

日志中还发现 60 条 retrieval SQLite 相关错误：

```text
database disk image is malformed
retrieval.sqlite.search_async failed
retrieval.service.search_async failed
```

这些错误来自 retrieval FTS 搜索路径，未确认是两个接口卡住的直接原因，但它是重要的数据库健康风险信号。由于主库和 WAL 很大，本次排查没有运行完整 `integrity_check`，避免对线上实例造成额外 I/O 压力。

## Current Assessment

主要判断：

1. 两个接口卡住的直接共同原因是完整 session projection refresh 被拖慢。
2. `/api/automation/projects` 卡住不是 `automation_projects` 表自身造成的。
3. 最大风险点在 `events` 表的大范围 latest terminal verification 查询。
4. 当前索引无法充分支持 `trace_id IN (...) AND event_type IN (...) ORDER BY id`。
5. 巨大的主库和 WAL 加上冷读或页面等待，会把一次 session list refresh 放大到分钟级。
6. retrieval FTS 的 `database disk image is malformed` 需要单独处理，否则可能继续制造数据库健康和性能问题。

## Recommended Actions

优先级建议：

1. 在维护窗口先备份 `relay_teams.db`、`relay_teams.db-wal`、`relay_teams.db-shm`。
2. 备份后执行 SQLite 健康检查，例如 `PRAGMA quick_check` 或按维护窗口评估 `PRAGMA integrity_check`。
3. 对 retrieval FTS 的 malformed 问题做重建或修复方案，避免继续从损坏索引读数据。
4. 优化 latest terminal verification 查询：
   - 增加适配索引，例如 `(trace_id, event_type, id)`。
   - 或改成使用已有 `(session_id, trace_id, event_type, id)` 索引的查询形态。
   - 或进一步缩小每个 IN chunk，避免单次冷读分片过大。
5. `/api/automation/projects` 在项目为空或不需要 session 绑定信息时应避免拉完整 session list。
6. 给 session list projection 增加分步骤耗时日志，便于以后直接定位慢在 repository 哪一步。
7. 低优先级补充索引：
   - `sessions(created_at DESC)`，支持 `SELECT * FROM sessions ORDER BY created_at DESC`。
   - `agent_instances(session_id, created_at ASC)`，降低 agent instance projection 的 4s 级成本。

## Non-Actions

本次没有执行以下操作：

- 没有修改远端代码。
- 没有修改远端数据库。
- 没有执行 `VACUUM`、checkpoint、repair、reindex 等会改写数据库文件的操作。
- 没有运行完整数据库完整性扫描。
