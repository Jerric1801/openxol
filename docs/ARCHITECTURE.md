# OpenXol — Architecture

## Process Model

Electron runs two OS processes that communicate only via IPC:

```
┌─────────────────────────────────────────────────────┐
│ Main Process (Node.js)          src/main/index.ts    │
│                                                      │
│  ┌──────────────┐  ┌──────────┐  ┌───────────────┐  │
│  │MeetingPipeline│  │ConfigMgr │  │ SetupManager  │  │
│  └──────┬───────┘  └──────────┘  └───────────────┘  │
│         │ spawn                                      │
│  ┌──────▼──────────────────────┐                     │
│  │ whisper binary (child proc) │                     │
│  └─────────────────────────────┘                     │
└────────────────────┬────────────────────────────────┘
                     │ IPC (contextBridge)
┌────────────────────▼────────────────────────────────┐
│ Renderer Process (Chromium)     src/renderer/        │
│  window.electronAPI  (preload bridge)                │
│  index.html / setup.html                             │
└─────────────────────────────────────────────────────┘
```

The renderer accesses main-process functionality **only** via `window.electronAPI` (defined in `src/preload/index.ts`).

## IPC Channel Registry

All channels must be documented here. Adding a channel without updating this table is a standards violation (see `docs/STANDARDS.md`).

### Renderer → Main (`ipcRenderer.invoke` / `ipcMain.handle`)

| Channel | Payload | Return | Description |
|---------|---------|--------|-------------|
| `get-config` | — | `Config` | Full config object from electron-store |
| `save-config` | `Config` | `boolean` | Persist config to electron-store |
| `select-audio-file` | — | `string \| null` | Native open-file dialog |
| `select-output-directory` | — | `string \| null` | Native open-directory dialog |
| `process-audio` | `audioPath: string, config: Config` | `{ success: true, result: PipelineResult }` | Start processing pipeline |
| `cancel-processing` | — | `{ success: boolean }` | Cancel active pipeline |
| `get-app-version` | — | `string` | Semver string from package.json |
| `check-setup-status` | — | `SetupStatus` | Verify binary + model presence on disk |
| `perform-setup` | — | `{ success: true }` | Download model, verify binaries |

### Renderer → Main (`ipcRenderer.send` / `ipcMain.on`)

| Channel | Payload | Description |
|---------|---------|-------------|
| `setup-finished` | — | Signal wizard complete; triggers reload to `index.html` |

### Main → Renderer (`webContents.send` / `ipcRenderer.on`)

| Channel | Payload | Description |
|---------|---------|-------------|
| `progress-update` | `{ step, progress, message }` | Setup wizard download progress |
| `processing-progress` | `{ step, progress, stepProgress, overallProgress, message }` | Pipeline processing progress |

## Processing Pipeline

`src/main/pipeline/orchestrator.js` — `MeetingPipeline.process()` runs 4 steps:

| Step | Module | Criticality | Skippable |
|------|--------|------------|-----------|
| 1. Transcription | `transcription.js` | **Critical** | No — pipeline aborts on failure |
| 2. Diarization | `diarization.js` | Optional | Yes — controlled by `config.diarization.enabled` |
| 3. AI Analysis | `analysis.js` | Optional | Yes — controlled by `config.analysis.enabled` |
| 4. DOCX Report | `docx-gen.js` | Optional | Yes — controlled by `config.document.enabled` |

Progress is reported to the renderer via `processing-progress` after each step (0–25–50–75–100%).

Analysis input: prefers diarized transcript if available; falls back to raw transcript.
Transcript normalisation: `MeetingPipeline.extractTranscriptText()` handles `string`, `{text}`, `{segments}`, `{raw}` shapes from whisper.cpp output.

## Startup Gateway

On launch, `main/index.ts` calls `SetupManager.checkSetupComplete()` before creating the window. This checks three files exist on disk:

1. whisper binary — `bin/<platform>/whisper[.exe]`
2. ffmpeg binary — `bin/<platform>/ffmpeg[.exe]`
3. Model — `userData/models/whisper/ggml-base.en.bin`

If all present → loads `index.html`. Otherwise → loads `setup.html`.

## Binary & Model Paths

| Context | Binaries | Model |
|---------|----------|-------|
| Dev | `<project>/bin/<platform>/` | `userData/models/whisper/` |
| Packaged | `Contents/Resources/bin/<platform>/` | `userData/models/whisper/` |

`process.resourcesPath` is used in packaged app for binaries. `app.getPath('userData')` for model (persists across app updates).

## Config Schema

Stored via `electron-store` at `userData/config.json`:

```typescript
{
  transcription: {
    model: string       // e.g. 'base.en'
    language: string    // '' = auto-detect
    useGpu: boolean
  }
  diarization: {
    enabled: boolean
    method: 'whisper-native'
  }
  analysis: {
    enabled: boolean
    apiKey: string      // Gemini API key
    model: string       // e.g. 'gemini-2.5-flash-lite'
  }
  document: {
    enabled: boolean
    includeToc: boolean
    includeSpeakerAnalysis: boolean
  }
  output: {
    directory: string
    useTimestampedDirs: boolean
  }
}
```

## Build Output

electron-vite compiles to `out/`:
- `out/main/index.js` — bundled main process (CJS, includes pipeline + utils)
- `out/preload/index.js` — bundled preload script

electron-builder packages `out/` + `src/renderer/` (static) + `resources/` + `assets/` into platform distributables.

Platform targets: macOS DMG, Windows NSIS installer, Linux AppImage.
