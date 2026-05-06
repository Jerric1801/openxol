# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm run dev          # run in development mode (opens DevTools automatically)
npm start            # run without DevTools
npm run build:mac    # build macOS DMG
npm run build:win    # build Windows NSIS installer
npm run build:linux  # build Linux AppImage
npm run build        # build for current platform
```

No test suite or linter configured.

## Architecture

Electron desktop app. Two processes communicate via IPC:

**Main process** (`src/main.js`) — orchestrates everything. Registers all IPC handlers. On launch, runs a gateway check: if whisper binary + ffmpeg binary + `ggml-base.en.bin` model all exist on disk, loads `index.html`; otherwise loads `setup.html` for the setup wizard.

**Renderer process** (`src/renderer/`) — vanilla JS/HTML/CSS, no framework. Accesses main process only through `window.electronAPI` (exposed via `src/preload.js` contextBridge). Two screens:
- `index.html` + `js/app.js` — main app UI
- `setup.html` + `js/setup.js` — first-run setup wizard

**IPC bridge** (`src/preload.js`) — exposes `window.electronAPI` with methods for config, file selection, audio processing, setup, and progress listeners.

## Processing Pipeline

`src/pipeline/orchestrator.js` — `MeetingPipeline` runs 4 steps sequentially:

1. **Transcription** (`transcription.js`) — spawns whisper.cpp binary as child process. **Critical**: pipeline aborts if this fails.
2. **Diarization** (`diarization.js`) — optional speaker identification. Non-critical; pipeline continues on failure.
3. **Analysis** (`analysis.js`) — sends transcript to Gemini API (`@google/generative-ai`). Non-critical.
4. **DOCX generation** (`docx-gen.js`) — produces report using `docx` package. Non-critical.

Pipeline supports cancellation via `isCancelled` flag (set by `cancel()` method). Progress updates flow from pipeline → main process → renderer via `mainWindow.webContents.send('processing-progress', ...)`.

Analysis prefers diarized transcript over raw transcript when both exist. `MeetingPipeline.extractTranscriptText()` is a static helper that normalizes the transcript object (handles string, `{text}`, `{segments}`, `{raw}` shapes from whisper.cpp).

## Key Utilities

**`src/utils/config-manager.js`** — wraps `electron-store`. Must call `await configManager.init()` before use (dynamic ES module import). Config stored in system userData dir. Default AI model: `gemini-2.5-flash-lite`.

**`src/utils/setup-manager.js`** — checks/downloads required components. Binaries expected at `bin/darwin/` or `bin/win32/` in dev; at `process.resourcesPath/bin/{platform}/` in packaged app. Whisper model (`ggml-base.en.bin`) stored in `userData/models/whisper/` and downloaded from HuggingFace on first run.

## Binary & Model Requirements

Dev setup needs binaries placed manually:
- `bin/darwin/whisper` and `bin/darwin/ffmpeg` (macOS)
- `bin/win32/whisper.exe`, `bin/win32/ffmpeg.exe` (Windows)

Model (`ggml-base.en.bin`) downloads automatically on first run via setup wizard. Can also be placed manually in `resources/models/whisper/` for bundling.
