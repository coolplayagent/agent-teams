# Frontend Pages And Layout

## Fixed Application Frame

The application occupies one viewport. The top bar and composer remain fixed in the frame; session inventory and message timeline scroll independently. Desktop, narrow, and overlay-sidebar modes preserve the same information architecture without document scrolling.

## Primary Navigation

The sidebar keeps the established Agent Teams order and inventory:

- Chat
- Automation
- Skills
- Board
- Search
- Connectors
- Memory
- Observability
- Settings

Workspace and session controls remain below the primary navigation. Settings uses a primary section list and secondary pages; secondary content is not flattened into the first settings screen.

## Chat Workspace

The chat workspace contains the round rail, virtualized timeline, recovery actions, token usage, and composer. Historical replay and live streaming share the same message components. Thinking folds under Processed after completion. A tool call progresses in one compact card from running to completed or failed. Copy and read actions sit below the final response.

Subagents open in a resizable right-side panel from the subagent tool card. The panel has its own prompt, stream, replay, thinking, and tools; child output never enters the parent timeline.

## Product Surfaces

Automation, Skills, Board, Search, Connectors, Memory, Observability, and project views are real feature pages with loading, empty, failure, narrow, and action states. Settings preserves the complete established section inventory and routes related areas through secondary pages.
