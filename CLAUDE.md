# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm run dev          # TypeScript watch + Electron (DevTools open automatically)
npm run start        # run built output (requires prior build)
npm run typecheck    # TypeScript type-check without emitting
npm run build:mac    # compile + build macOS DMG
npm run build:win    # compile + build Windows NSIS installer
npm run build:linux  # compile + build Linux AppImage
npm run build        # compile + build for current platform
```

No test suite configured yet (Phase 3). No linter configured yet.

## Architecture

Electron desktop app — open-source alternative to otter.ai. See `docs/ARCHITECTURE.md` for full detail.

**Main process** (`src/main/index.ts`) — TypeScript, compiled by electron-vite to `out/main/index.js`. Registers all IPC handlers. On launch runs a gateway check: if whisper binary + ffmpeg binary + `ggml-base.en.bin` model all exist on disk, loads `index.html`; otherwise loads `setup.html`.

**Renderer process** (`src/renderer/`) — vanilla JS/HTML/CSS (no framework, no bundler yet — Phase 2). Accesses main process only via `window.electronAPI` (exposed by `src/preload/index.ts`). Two screens: `index.html` (main app) and `setup.html` (first-run wizard). Loaded via `mainWindow.loadFile()` as static files — not processed by Vite.

**Preload** (`src/preload/index.ts`) — TypeScript, compiled by electron-vite to `out/preload/index.js`. Exposes `window.electronAPI` via contextBridge.

## Processing Pipeline

`src/main/pipeline/orchestrator.js` — `MeetingPipeline` runs 4 steps:

1. **Transcription** (`transcription.js`) — spawns whisper.cpp binary. **Critical**: pipeline aborts if this fails.
2. **Diarization** (`diarization.js`) — optional speaker identification. Non-critical.
3. **Analysis** (`analysis.js`) — Gemini API (`@google/generative-ai`). Non-critical.
4. **DOCX generation** (`docx-gen.js`) — `docx` package. Non-critical.

Pipeline supports cancellation via `isCancelled` flag. Progress flows via `mainWindow.webContents.send('processing-progress', ...)`. Analysis prefers diarized transcript; falls back to raw. `MeetingPipeline.extractTranscriptText()` normalises transcript object shapes.

## Key Utilities

**`src/main/utils/config-manager.js`** — wraps `electron-store`. Call `await configManager.init()` before use (dynamic ESM import). Default AI model: `gemini-2.5-flash-lite`.

**`src/main/utils/setup-manager.js`** — checks/downloads required components. Dev binaries: `bin/darwin/` or `bin/win32/`. Packaged: `process.resourcesPath/bin/<platform>/`. Model stored in `userData/models/whisper/`, downloaded from HuggingFace on first run.

## Standards

Language: **TypeScript strict** for `src/main/` and `src/preload/`. No `any` without `// reason:` comment. See `docs/STANDARDS.md` for full naming conventions and rules.

## Docs

| File | Purpose |
|------|---------|
| `docs/ARCHITECTURE.md` | IPC channel registry, pipeline contract, config schema |
| `docs/STANDARDS.md` | Naming, TypeScript rules, error shapes, git conventions |
| `docs/BRANDING.md` | Name, pronunciation, colors, logo, voice |
| `docs/CONTRIBUTING.md` | Dev setup, binary placement, PR process |

## Binary & Model Requirements

Dev needs binaries placed manually:
- `bin/darwin/whisper`, `bin/darwin/ffmpeg` (macOS)
- `bin/win32/whisper.exe`, `bin/win32/ffmpeg.exe`, `bin/win32/whisper.dll`, `bin/win32/SDL2.dll` (Windows)
- `bin/linux/whisper`, `bin/linux/ffmpeg` (Linux)

Model (`ggml-base.en.bin`) downloads automatically via setup wizard, or place manually in `resources/models/whisper/`.
