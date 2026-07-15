# Frontend Runtime Flows

## Send And Stream

1. The composer validates the selected workspace, session mode, role, target, model, and run options.
2. The API creates or resumes a run.
3. The stream controller records session ownership and opens SSE from the current cursor.
4. Typed runtime reducers merge deltas into stable message, thinking, and tool rows.
5. Terminal state folds processed work, settles actions, updates token usage, and closes the live cursor.

Live rows grow in place. Hydration never paints a completed answer and then rebuilds it as a synthetic typewriter animation.

## Replay And Refresh

Session hydration loads persisted rounds/messages and the recovery snapshot. Runtime events are merged by durable identity and order. Refresh reconnects after the latest event id, deduplicates overlap, and preserves exact visible content, tool state, processed folding, and scroll anchoring.

## Session Switching

Tracked streams retain their owning session while hidden. Switching back restores the current ordered projection and follows subsequent events. Late responses from a previously selected session cannot reconcile or close the newly selected session.

## Recovery Actions

Approvals, questions, recoverable stops, background tasks, and paused subagents appear between the timeline and composer. Actions remain visible on failure and can be retried. Resume starts from the backend checkpoint.

## Subagents

A subagent tool card opens the right panel while the child is running or after completion. Child SSE and replay use the same timeline primitives as the parent but remain scoped by child session/run identity. Prompt, incremental output, thinking, tools, terminal hydration, refresh, and pause/resume are supported without leaking child rows into the parent conversation.

## Scroll

The virtual timeline follows new content only when pinned to the bottom. When the user reads older content, row measurement and hydration preserve the current anchor. Neither timeline nor sidebar scrolling moves the document frame.
