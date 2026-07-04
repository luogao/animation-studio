# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Animation Studio — web-based conversational GSAP animation designer. Users describe a scene in chat, a Claude agent emits a declarative `SceneConfig`, the browser plays it live as a GSAP timeline, and the confirmed config is exported as JSON for an external Remotion pipeline (`video-studio`). See `docs/PRD.md` for the full spec.

## Commands

- `npm run dev` — start everything (Express + Vite middleware + WebSocket) on http://localhost:5174 via `tsx watch server/index.ts`. **No typechecking happens in dev** — `tsx` only runs the server; Vite serves the frontend without typecheck. Run `npm run typecheck` or `npm run build` to catch TS errors.
- `npm run typecheck` — runs `tsc` against both `tsconfig.json` (frontend `src/`) and `tsconfig.server.json` (`server/` + `src/types/`).
- `npm run build` — `npm run typecheck && vite build`. Production bundle for the frontend only; the server runs under `tsx`/node ESM in production.
- `npm run preview` — serve the production build.
- No test runner is configured.
- Agent env vars (all optional):
  - `CLAUDE_MODEL` — override the model id (defaults to `ark-code-latest` in `server/agent.ts`).
  - `CLAUDE_SETTINGS_FILE` — override the path to the settings file (defaults to `<project_root>/.claude/setting.agent.json`).
  - Auth is handled by the Claude Code CLI itself — the SDK spawns it as a subprocess and it uses whatever login / settings you have configured. Do not gate on `ANTHROPIC_API_KEY`.

## Architecture

### Single dev server, three transports in one process
`server/index.ts` creates one HTTP server that mounts:
1. a `WebSocketServer` on path `/ws`, and
2. Vite dev middleware via `createViteServer({ server: { middlewareMode: true }, appType: "spa" })`.

Both the SPA and the WS client are served from the same origin/port (5174). There is no separate Vite dev server process — do not start `vite` directly.

### Two tsconfigs
`tsconfig.json` covers `src/` (frontend, `noEmit`, DOM libs). `tsconfig.server.json` covers `server/` + `src/types/` so the server can import the shared `SceneConfig` type. Both are `noEmit`; runtime is handled by `tsx` (dev) and `vite build` (prod bundle for frontend only). Server code is not bundled for production — it runs under `tsx`/node ESM.

### `SceneConfig` is the single source of truth
`src/types/scene.ts` defines the declarative animation config (`actors`, `connections`, `phases`, `effects`, `width`, `height`, `duration`, `background`). The same shape:
- drives `DynamicScene` (SVG render),
- drives `useGsapTimeline` (compiles `phases` into a GSAP timeline),
- is what the agent emits via the `update_scene_config` tool,
- is what gets exported.

When editing the type, update **all four** places: the TS interface, the system prompt's interface block in `server/prompts.ts`, the `update_scene_config` tool's `inputSchema` in `server/agent.ts`, and the effect factory in `src/lib/gsapEffects.ts` if a new phase/effect name is introduced.

### End-to-end data flow
```
ChatPanel → sendMessage (src/hooks/useWebSocket.ts)
  → WS { type: "chat", payload: { text, config } }
  → handleWsMessage (server/wsHandler.ts)
  → runAgent (server/agent.ts) — streams Claude Agent SDK output
  → WS { type: "stream" | "config_update" | "done" | "error" }
  → dispatchToStore → Zustand store
  → DynamicScene re-renders + useGsapTimeline rebuilds timeline & auto-plays
```

The agent receives the **current** config in every `chat` message and must return the **complete** new config (never a diff) via the `update_scene_config` tool. The system prompt in `server/prompts.ts` enforces this.

### GSAP ↔ SVG contract
- Each `<g data-actor-id={id}>` (in `ActorRenderer`) and each `<line data-conn-to={id}>` (in `ConnectionRenderer`) are the selectors GSAP targets. Don't change these attribute names without updating `applyPhase` in `useGsapTimeline.ts`.
- The outer `<g transform="translate(x,y)">` on actors intentionally isolates static positioning from GSAP's CSS transforms. Keep that two-layer structure.
- Connections use `pathLength={1}` so `strokeDashoffset` animations are normalized — `getEnterEffect("draw-line")` and `getDrawLineTween` rely on this.
- `useGsapTimeline` runs inside `gsap.context(root)` scoped to the stage ref and calls `ctx.revert()` on cleanup; this is what makes config changes safely rebuild the timeline.

### Playback controller bridge
`useGsapTimeline` registers a `TimelineController` (`play`/`pause`/`seek`/`duration`) into the Zustand store. External components (`Timeline`, anything future) read `timelineController` from the store instead of talking to GSAP directly — keep that pattern.

### WebSocket singleton
`useWebSocket` keeps a module-level `socket` and auto-reconnects (2s backoff). `dispatchToStore` mutates Zustand directly from incoming messages; `sendMessage` is freestanding (not a hook) so any component can call it.

### Agent integration (Claude Agent SDK 0.3.x)
`server/agent.ts` is the only place that talks to the SDK. The pattern:

1. Define `update_scene_config` with `tool(name, description, zodShape, handler)` — the `zodShape` is a plain object of `{ key: z.xxx() }` (a Zod raw shape), **not** `z.object(...)`. Keep it in sync with `src/types/scene.ts` (TS interface) and `server/prompts.ts` (system-prompt interface block) when changing the schema.
2. Wrap with `createSdkMcpServer({ name: "studio", tools: [...] })` → pass as `mcpServers: { studio }` to `query()`.
3. `query()` options: `tools: []` disables all built-in tools so the agent can only call our MCP tool; `permissionMode: "bypassPermissions"` + `allowDangerouslySkipPermissions: true` skips prompts (safe because the only callable tool is our in-process handler).
4. Iterate the returned `Query` async generator. `assistant` messages contain `message.content[]` blocks (`text` / `tool_use`). `tool_use` blocks for our tool are dispatched in-process by the MCP handler — no need to parse them here. Multi-turn text deltas are joined with `\n\n`.
5. The handler runs **in-process** and calls `callbacks.onConfigUpdate(args)` synchronously — the new config flows to the client via the WS `config_update` message in `wsHandler.ts`.

**Do NOT** pass custom tool definitions to `Options.tools` — that field is `string[]` of built-in tool names. The SDK will silently ignore the wrong shape and the agent won't have the tool available. Custom tools must go through `mcpServers`.

The SDK spawns the Claude Code CLI as a subprocess (`@anthropic-ai/claude-agent-sdk-darwin-arm64` is the platform binary). Per-query latency includes subprocess startup.

## Design constraints (from PRD)

- The preview is a **real-time GSAP timeline in the browser**, not a Remotion frame-seek. Don't introduce frame-based logic.
- Default canvas 1440×810, background `#0a0a0b`. Accent palette: `#E8A230` (warm orange-gold, primary), `#4a9eff` (blue), `#ff5e5e` (red), `#333` (gray). Swiss International style.
- Agent model is pinned in `server/agent.ts` to `claude-sonnet-4-20250514`. `maxTurns: 3`.
- The exported `scene-config.json` is consumed by a separate Remotion `DynamicScene` in an external `video-studio` project — keep the JSON shape Remotion-compatible (no functions, no class instances).

## Conventions

- Every TS/TSX file starts with a `// ===` header block describing its role. Preserve and update it when refactoring.
- Server files import each other with explicit `.js` extensions (e.g. `./agent.js`) even though the source is `.ts` — required for `tsx`/ESM resolution. Keep that style in new server modules.
- Components pull state via `useSceneStore((s) => s.x))` selectors (Zustand idiom) — avoid subscribing to the whole store.
- `server/wsHandler.ts` defines the wire protocol types (`MessageType`); keep them mirrored in `src/hooks/useWebSocket.ts`'s `ServerMessage` when changing messages.
- GSAP types ship as an ambient `declare namespace gsap` (see `node_modules/gsap/types/`), so `gsap.TweenVars`, `gsap.core.Timeline`, etc. are usable in type positions **without any import**. Only `import gsap from "gsap"` when you need the runtime value (`gsap.context()`, `gsap.timeline()`). See `src/lib/gsapEffects.ts` for the type-only pattern, `src/hooks/useGsapTimeline.ts` for the value-import pattern. Do **not** `import { TweenVars } from "gsap"` — it isn't a named export, and importing the `gsap` value just for type access trips `noUnusedLocals`.
