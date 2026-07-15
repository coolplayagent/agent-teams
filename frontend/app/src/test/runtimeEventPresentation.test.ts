import { describe, expect, it } from "vitest";

import type { JsonValue } from "../api/contracts";
import { translate, type Translate } from "../i18n";
import type { RunEventType } from "../runtime/events";
import type { TimelineEntry } from "../runtime/reducers";
import {
  injectionStatusLabel,
  runtimeInjectionSummary,
  runtimeStructuredEventText,
} from "../features/timeline/runtimeEventPresentation";

describe("runtimeEventPresentation", () => {
  it("formats structured protocol events with English presentation copy", () => {
    const t = translator("en");

    expect(runtimeStructuredEventText(entry("token_usage", {
      cached_input_tokens: 20,
      input_tokens: 70,
      output_tokens: 30,
      reasoning_output_tokens: 5,
      total_tokens: 100,
    }), t)).toBe(
      "Token usage: Total 100 · Input 70 · Cached 20 · Output 30 · Reasoning 5",
    );
    expect(runtimeStructuredEventText(entry("todo_updated", {
      items: [
        { content: "Ship release", status: "in_progress" },
        { content: "Write notes", status: "pending" },
      ],
      updated_by_role_id: "coordinator",
      version: 3,
    }), t)).toBe(
      "Todo updated: 2 items · 1 In progress, 1 Pending · Current Ship release · v3 · by coordinator",
    );
    expect(runtimeStructuredEventText(entry("subagent_session_status_changed", {
      run_phase: "subagent_running",
      run_status: "running",
      subagent_instance_id: "worker-1",
      subagent_role_id: "reviewer",
      title: "Review PR",
    }), t)).toBe(
      "Subagent status: Review PR · status Running · phase subagent running · role reviewer · instance worker-1",
    );
    expect(runtimeStructuredEventText(entry("notification_requested", {
      channels: ["desktop", "feishu"],
      notification_type: "run_failed",
      title: "Run failed",
    }), t)).toBe(
      "Notification: Run failed · type run_failed · channels desktop, feishu",
    );
  });

  it("formats the same structured protocol events with Chinese presentation copy", () => {
    const t = translator("zh-CN");

    expect(runtimeStructuredEventText(entry("token_usage", {
      cached_input_tokens: 20,
      input_tokens: 70,
      output_tokens: 30,
      reasoning_output_tokens: 5,
      total_tokens: 100,
    }), t)).toBe(
      "Token 用量: 总计 100 · 输入 70 · 缓存 20 · 输出 30 · 推理 5",
    );
    expect(runtimeStructuredEventText(entry("todo_updated", {
      items: [
        { content: "发布版本", status: "in_progress" },
        { content: "编写说明", status: "pending" },
      ],
      updated_by_role_id: "coordinator",
      version: 3,
    }), t)).toBe(
      "待办已更新: 2 项 · 1 项进行中, 1 项待办 · 当前 发布版本 · v3 · 由 coordinator 更新",
    );
    expect(runtimeStructuredEventText(entry("subagent_session_status_changed", {
      run_phase: "subagent_running",
      run_status: "running",
      subagent_instance_id: "worker-1",
      subagent_role_id: "reviewer",
      title: "审查 PR",
    }), t)).toBe(
      "子代理状态: 审查 PR · 状态 运行中 · 阶段 子代理运行中 · 角色 reviewer · 实例 worker-1",
    );
    expect(runtimeStructuredEventText(entry("notification_requested", {
      channels: ["desktop", "feishu"],
      notification_type: "run_failed",
      title: "运行失败",
    }), t)).toBe(
      "通知: 运行失败 · 类型 run_failed · 渠道 desktop, feishu",
    );
  });

  it("localizes persisted and live injection labels through the same adapter", () => {
    const payload: Record<string, JsonValue> = {
      content: "Retry with logs",
      delivery_mode: "queued",
      recipient_instance_id: "worker-1",
      source: "user",
    };

    expect(runtimeInjectionSummary(payload, translator("en"))).toBe(
      "Retry with logs · source user · mode Queued · to worker-1",
    );
    expect(runtimeInjectionSummary(payload, translator("zh-CN"))).toBe(
      "Retry with logs · 来源 user · 模式 已排队 · 发送给 worker-1",
    );
    expect(injectionStatusLabel("applied", translator("zh-CN"))).toBe("插入消息已应用");
    expect(injectionStatusLabel("failed", translator("en"))).toBe("Injection failed");
  });
});

function translator(language: "en" | "zh-CN"): Translate {
  return (key, replacements) => translate(language, key, replacements);
}

function entry(kind: RunEventType, payload: JsonValue): TimelineEntry {
  return {
    eventId: 1,
    id: `run-1:${kind}`,
    kind,
    occurredAt: "2026-07-14T00:00:00Z",
    payload,
    roleId: "MainAgent",
    runId: "run-1",
    sessionId: "session-1",
    text: kind,
  };
}
