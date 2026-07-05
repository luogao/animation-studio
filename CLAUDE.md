# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Animation Studio — web-based conversational GSAP animation designer. Multi-project, tree-versioned, agent-driven. Users describe a scene in chat, a Claude agent emits a declarative `SceneConfig`, the browser plays it live as a GSAP timeline, drafts/commits persist to SQLite, and the confirmed config is exported as JSON for an external Remotion pipeline (`video-studio`). See `docs/PRD.md` for the full spec.

## Commands

- `npm run dev` — start everything (Express + Vite middleware + WebSocket) on http://localhost:5174 via `tsx watch server/index.ts`. **No typechecking happens in dev** — `tsx` only runs the server; Vite serves the frontend without typecheck. Run `npm run typecheck` or `npm run build` to catch TS errors.
- `npm run typecheck` — runs `tsc` against both `tsconfig.json` (frontend `src/`) and `tsconfig.server.json` (`server/` + `src/types/`).
- `npm run build` — `npm run typecheck && vite build`. Production bundle for the frontend only; the server runs under `tsx`/node ESM in production.
- `npm run preview` — serve the production build.
- No test runner is configured.
- Server env vars (all optional):
  - `STUDIO_DB_PATH` — override SQLite location (defaults to `<project_root>/.data/studio.db`).
  - `CLAUDE_MODEL` — override the model id (defaults to `ark-code-latest` in `server/agent.ts`).
  - `CLAUDE_SETTINGS_FILE` — override the path to the settings file (defaults to `<project_root>/.claude/setting.agent.json`).
  - Auth is handled by the Claude Code CLI itself — the SDK spawns it as a subprocess and it uses whatever login / settings you have configured. Do not gate on `ANTHROPIC_API_KEY`.

## Architecture

### Single dev server, hybrid transport
`server/index.ts` creates one HTTP server that mounts:
1. Express routes at `/api/*` (REST CRUD — see `server/routes.ts`),
2. a `WebSocketServer` on path `/ws` (agent streaming), and
3. Vite dev middleware via `createViteServer({ server: { middlewareMode: true }, appType: "spa" })`.

All three serve from the same origin/port (5174). There is no separate Vite dev server process — do not start `vite` directly.

### DB layer
`server/db/index.ts` opens SQLite at `<project_root>/.data/studio.db` via `better-sqlite3` (synchronous). Boots with `journal_mode=WAL`, `foreign_keys=ON`, idempotent DDL, and a small `ensureColumn()` migration helper for additive column changes (no ALTER TABLE IF NOT EXISTS in SQLite). The `.data/` directory also holds:
- `studio.db` + WAL/SHM files
- `sessions/` — Claude Agent SDK session JSONLs (CLAUDE_CONFIG_DIR override)

Four tables: `projects`, `versions`, `messages`, plus `tool_calls_json` column on `messages` (additive migration via `ensureColumn()`). Versions form a tree via `parent_id`; one draft per project enforced by partial unique index `idx_draft_per_project WHERE status='draft'`. `claude_session_id` on `projects` ties the row to a Claude Agent SDK session.

Server DB modules:
- `server/db/projects.ts` — `createProject`, `listProjects`, `getProject`, `getProjectRow`, `getSessionId`, `setSessionId`, `renameProject`, `touchProject`.
- `server/db/versions.ts` — `createDraft`, `updateDraft`, `commitDraft`, `listVersions`, `getDraft`, `rollbackTo` (git-style: creates new committed child of target, never mutates history).
- `server/db/messages.ts` — `insertMessage`, `listMessages`. `tool_calls_json` column stores serialized `ToolCallRecord[]`; read/write auto-serializes.

### RunState registry (`server/runRegistry.ts`)
In-memory only (server restart clears it; acceptable since agent subprocess dies too). Tracks:
- `runs: Map<projectId, RunState>` — active agent run per project (concurrent-run guard: 1 at a time)
- `subscribers: Map<projectId, Set<WebSocket>>` — all tabs subscribed to a project's broadcasts
- `subscribe(ws, projectId, sendFn)` — adds ws to set, immediately pushes current RunState (recovery)
- `broadcast(projectId, msg)` — sends to all subscribers (replaces old unicast-to-originator pattern)
- `startRun / endRun / updatePhase / appendRunText` — lifecycle helpers called from agent.ts

### REST API (`server/routes.ts`, mounted at `/api`)
```
GET    /api/projects                                     → Project[]
POST   /api/projects                  {title?}           → ProjectDetail (seeds v1 committed from DEFAULT_SCENE_CONFIG)
GET    /api/projects/:id                                → {project, versions[], messages[], headId, draftId?}
POST   /api/projects/:id/messages     {role, content, versionId?}
POST   /api/projects/:id/versions     {parentId, config, label?}    → draft
PATCH  /api/projects/:id/versions/:vid {config?}                       → update draft body
POST   /api/projects/:id/versions/:vid/commit {label?}                → commit
POST   /api/projects/:id/rollback     {targetVersionId}               → new head (committed child of target)
DELETE /api/projects/:id/versions/:vid                                → discard draft
```

### WebSocket protocol
Hybrid transport — REST handles CRUD; WS handles agent streaming + state broadcast. Message types:

| Direction | Type | Payload | Purpose |
|---|---|---|---|
| C→S | `subscribe` | `{projectId}` | Subscribe to project broadcasts |
| C→S | `chat` | `{text, baseConfig, projectId, baseVersionId}` | Start agent run |
| S→C | `agent_state` | `RunState \| null` | Current run phase (recovery on reconnect) |
| S→C | `stream` | `{delta}` | Text delta (character-level) |
| S→C | `tool_use` | `{toolCallId, toolName, input}` | Tool call started |
| S→C | `tool_result` | `{toolUseId, content, isError}` | Tool call finished |
| S→C | `config_update` | `{config}` | Full SceneConfig from agent tool |
| S→C | `done` | `{}` | Agent finished successfully |
| S→C | `error` | `{message}` | Agent errored |

All S→C messages are **broadcast** to all subscribers of that projectId (multi-tab sync). Server-side, agent.ts calls `startRun`/`endRun`/`updatePhase`/`appendRunText` on the registry, which auto-broadcasts `agent_state` transitions.
Wire types in `server/wsHandler.ts` and mirrored in `src/hooks/useWebSocket.ts`.

### URL routing
Plain History API at `/p/:projectId` (no react-router). `src/App.tsx` parses on mount, listens `popstate` for back/forward, pushes URL on project switch. `useWebSocket.setCurrentProject(id)` wires the active project to WS subscribe. Refresh → URL parsed → `loadProject(id)` → WS reconnect → `subscribe` → server pushes current `RunState` → UI recovers streaming state.

### Two tsconfigs
`tsconfig.json` covers `src/` (frontend, `noEmit`, DOM libs). `tsconfig.server.json` covers `server/` + `src/types/` so the server can import the shared `SceneConfig` type. Both are `noEmit`; runtime is handled by `tsx` (dev) and `vite build` (prod bundle for frontend only). Server code is not bundled for production — it runs under `tsx`/node ESM.

### `SceneConfig` is the single source of truth
`src/types/scene.ts` defines the declarative animation config (`actors`, `connections`, `phases`, `effects`, `width`, `height`, `duration`, `background`). The same shape:
- drives `DynamicScene` (SVG render),
- drives `useGsapTimeline` (compiles `phases` into a GSAP timeline),
- is what the agent emits via the `update_scene_config` tool,
- is what gets persisted in `versions.config_json`,
- is what gets exported (wrapped in `ExportedSceneConfig` envelope).

When editing the type, update **all four** places: the TS interface, the system prompt's interface block in `server/prompts.ts`, the `update_scene_config` tool's `inputSchema` in `server/agent.ts`, and the effect factory in `src/lib/gsapEffects.ts` if a new phase/effect name is introduced.

### State stores — three-way split
The old single `sceneStore` was replaced with three focused stores:

- **`src/store/projectStore.ts`** (server-synced, persistent) — `projectId`, `projectTitle`, `headVersionId`, `committedConfig`, `draft: {id, config} | null`, `versions: VersionMeta[]`, `loading`, `error`. Actions: `loadProject`, `createProject`, `commitDraft`, `discardDraft`, `rollbackTo`, `applyAgentConfig` (optimistic local draft write from WS `config_update`). Derived selector `selectPreviewConfig = s.draft?.config ?? s.committedConfig`.
- **`src/store/agentStore.ts`** (session) — `chatMessages`, `isStreaming`, `runState: RunState | null` (phase tracking — `thinking`/`streaming`/`tool_calling`/`complete`/`error`). Actions: `addMessage`, `appendDelta`, `setStreaming`, `loadMessages`, `clearForProject`, `setRunState`, `syncStreamingText` (recovery merge), `appendToolCall`/`resolveToolCall`/`finalizeRunningToolCalls`. Tool calls now persist to DB (`messages.tool_calls_json`), so `loadMessages` restores them after reload.
- **`src/store/previewStore.ts`** (ephemeral playback UI) — `currentTime`, `isPlaying`, `timelineController` + setters.

Consumers use `useXxxStore((s) => s.field)` selectors (Zustand idiom) — avoid subscribing to the whole store. `canvasSize` was removed entirely; canvas dimensions read/write through `config.width/height` via `applyAgentConfig` (treating canvas-size change as a draft edit).

### End-to-end data flow
```
ChatPanel.onSubmit
  → useWebSocket.sendMessage(text)
  → if projectStore.draft exists: auto-commit draft
  → agentStore.addMessage(user) — local placeholder
  → agentStore.addMessage(assistant placeholder) + setStreaming(true)
  → WS { type: "chat", payload: {text, baseConfig, projectId, baseVersionId} }
  → handleWsMessage (server/wsHandler.ts)
    → subscribe(ws, projectId) — defensive idempotent
    → insertMessage({role:"user"}) — server-side persist
    → runAgent (server/agent.ts) — streams Claude Agent SDK output
      → startRun → broadcast agent_state(thinking)
      → text_delta → appendRunText → broadcast stream + agent_state(streaming)
      → tool_use → broadcast tool_use + agent_state(tool_calling)
      → tool_result → broadcast tool_result + agent_state(streaming)
      → done → accumulate toolCalls → insertMessage({role:"assistant", toolCalls})
             → broadcast done + agent_state(complete) → endRun → broadcast agent_state(null)
  → dispatchToStore (client):
    stream → agentStore.appendDelta
    tool_use → agentStore.appendToolCall
    tool_result → agentStore.resolveToolCall
    config_update → projectStore.applyAgentConfig
    done → agentStore.finalizeRunningToolCalls + projectStore.loadProject()
    agent_state → agentStore.setRunState + syncStreamingText (recovery)
  → DynamicScene re-renders + useGsapTimeline rebuilds timeline & auto-plays
```

The agent receives the **current** config in every `chat` message and must return the **complete** new config (never a diff) via the `update_scene_config` tool.

### Draft → commit flow
- **Agent tool call → draft**: `update_scene_config` handler in `agent.ts` resolves current draft (creates via `createDraft(projectId, baseVersionId, config)` if none), then `updateDraft(draft.id, config)`. Fires `onConfigUpdate(newConfig)` to client for optimistic UI.
- **Auto-commit on next user message**: `useWebSocket.sendMessage` checks `projectStore.draft`; if present, POSTs commit with label `"auto: before turn N"`, reloads project, then sends WS chat with new `baseVersionId = headVersionId`.
- **Manual commit**: toolbar 提交草稿 button → same commit endpoint with optional user label.
- **Rollback → branch**: `POST /api/projects/:id/rollback {targetVersionId}` commits current draft (if any) first, then inserts new committed version with `parent_id = targetVersionId`. New head = this version. Next agent turn branches off it. History is never mutated or deleted.

### GSAP ↔ SVG contract
- Each `<g data-actor-id={id}>` (in `ActorRenderer`) and each `<line data-conn-to={id}>` (in `ConnectionRenderer`) are the selectors GSAP targets. Don't change these attribute names without updating `applyPhase` in `useGsapTimeline.ts`.
- The outer `<g transform="translate(x,y)">` on actors intentionally isolates static positioning from GSAP's CSS transforms. Keep that two-layer structure.
- Connections use `pathLength={1}` so `strokeDashoffset` animations are normalized — `getEnterEffect("draw-line")` and `getDrawLineTween` rely on this.
- `useGsapTimeline` runs inside `gsap.context(root)` scoped to the stage ref and calls `ctx.revert()` on cleanup; this is what makes config changes safely rebuild the timeline.

### Playback controller bridge
`useGsapTimeline` registers a `TimelineController` (`play`/`pause`/`seek`/`duration`) into `previewStore`. External components (`Timeline`, anything future) read `timelineController` from the store instead of talking to GSAP directly — keep that pattern.

### WebSocket singleton
`useWebSocket` keeps a module-level `socket` and auto-reconnects (2s backoff). `dispatchToStore` mutates Zustand directly from incoming messages; `sendMessage` is freestanding (not a hook) so any component can call it. `setCurrentProject(id)` is exported for the URL routing layer to wire project switches to WS subscribe — on reconnect, `sendSubscribeIfOpen()` re-subscribes so the server pushes fresh `agent_state`.

### assistant-ui integration
`src/lib/assistantRuntime.ts` adapts Zustand stores to assistant-ui's `ExternalStoreAdapter` protocol. `ChatPanel.tsx` wraps with `AssistantRuntimeProvider` and uses `ThreadPrimitive`/`ComposerPrimitive` for message list, auto-scroll, and keyboard handling. Message rendering:
- `MarkdownText` — streaming markdown with caret via `react-markdown` + `remark-gfm`
- `ToolCallCard` — renders `toolCalls[]` on assistant messages (phase badge, expandable input/output)
- `PhaseEmpty` + `PhaseStatusChip` — phase-aware placeholders driven by `agentStore.runState`

### Agent integration (Claude Agent SDK 0.3.x)
`server/agent.ts` is the only place that talks to the SDK. The pattern:

1. Define tools with `tool(name, description, zodShape, handler)` — the `zodShape` is a plain object of `{ key: z.xxx() }` (a Zod raw shape), **not** `z.object(...)`. Keep it in sync with `src/types/scene.ts` (TS interface) and `server/prompts.ts` (system-prompt interface block) when changing the schema.
2. Wrap with `createSdkMcpServer({ name: "studio", tools: [...] })` → pass as `mcpServers: { studio }` to `query()`.
3. `query()` options: `tools: []` disables all built-in tools so the agent can only call our MCP tools; `permissionMode: "bypassPermissions"` + `allowDangerouslySkipPermissions: true` skips prompts (safe because the only callable tools are our in-process handlers).
4. **Session resume**: SDK has **no `messages` option** in `query()`. Multi-turn memory works via `Options.sessionId` (first turn) / `Options.resume` (subsequent turns); SDK persists conversation JSONL to `<CLAUDE_CONFIG_DIR>/projects/<sanitized-cwd>/<sessionId>.jsonl`. We override `CLAUDE_CONFIG_DIR` via `Options.env` to `.data/sessions/` (exported as `SESSIONS_DIR` from `server/db/index.ts`). Per-project `claude_session_id` stored in `projects` table; `getSessionId`/`setSessionId` in `server/db/projects.ts`. DB messages are now UI-level cache only — SDK session is the source of truth for agent memory. Note: relocating `CLAUDE_CONFIG_DIR` moves the **entire** Claude state root (todos/, shell-snapshots/, .credentials.json, history.jsonl, etc.) into `.data/sessions/`, not just session JSONLs.
5. Three MCP tools:
   - `update_scene_config(config)` — full SceneConfig, persists to draft.
   - `get_version_history()` — no args, returns JSON of version tree for current project.
   - `rollback_to_version(targetVersionId, confirmation)` — must pass `confirmation: true` to execute; `false` returns error text asking user to confirm. Executes git-style rollback.
6. Iterate the returned `Query` async generator. `assistant` messages contain `message.content[]` blocks (`text` / `tool_use`). `tool_use` blocks for our tools are dispatched in-process by the MCP handler — no need to parse them here. Multi-turn text deltas are joined with `\n\n`.
7. The handler runs **in-process** and calls `callbacks.onConfigUpdate(args)` synchronously — the new config flows to the client via the WS `config_update` message in `wsHandler.ts`.

**Do NOT** pass custom tool definitions to `Options.tools` — that field is `string[]` of built-in tool names. The SDK will silently ignore the wrong shape and the agent won't have the tool available. Custom tools must go through `mcpServers`.

The SDK spawns the Claude Code CLI as a subprocess (`@anthropic-ai/claude-agent-sdk-darwin-arm64` is the platform binary). Per-query latency includes subprocess startup.

## Design constraints (from PRD)

- The preview is a **real-time GSAP timeline in the browser**, not a Remotion frame-seek. Don't introduce frame-based logic.
- Default canvas 1440×810, background `#0a0a0b`. Accent palette: `#E8A230` (warm orange-gold, primary), `#4a9eff` (blue), `#ff5e5e` (red), `#333` (gray). Swiss International style.
- Agent model is pinned in `server/agent.ts` to `ark-code-latest`. `maxTurns: 50`.
- The exported JSON is consumed by a separate Remotion `DynamicScene` in an external `video-studio` project — keep the JSON shape Remotion-compatible (no functions, no class instances). Currently wrapped in an `ExportedSceneConfig` envelope — Remotion consumers unwrap one level.

## Conventions

- Every TS/TSX file starts with a `// ===` header block describing its role. Preserve and update it when refactoring.
- Server files import each other with explicit `.js` extensions (e.g. `./agent.js`) even though the source is `.ts` — required for `tsx`/ESM resolution. Keep that style in new server modules.
- Components pull state via `useXxxStore((s) => s.field))` selectors (Zustand idiom) — `useProjectStore`, `useAgentStore`, `usePreviewStore`. Avoid subscribing to the whole store. The old single `useSceneStore` no longer exists.
- `server/wsHandler.ts` defines the wire protocol types (`MessageType`); keep them mirrored in `src/hooks/useWebSocket.ts`'s `ServerMessage` when changing messages.
- GSAP types ship as an ambient `declare namespace gsap` (see `node_modules/gsap/types/`), so `gsap.TweenVars`, `gsap.core.Timeline`, etc. are usable in type positions **without any import**. Only `import gsap from "gsap"` when you need the runtime value (`gsap.context()`, `gsap.timeline()`). See `src/lib/gsapEffects.ts` for the type-only pattern, `src/hooks/useGsapTimeline.ts` for the value-import pattern. Do **not** `import { TweenVars } from "gsap"` — it isn't a named export, and importing the `gsap` value just for type access trips `noUnusedLocals`.
- `.data/` is gitignored — includes `studio.db`, WAL files, and `sessions/` (Claude Agent SDK state root). Wiping it resets all projects and agent memory.
