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

## Recording Module (Planned — Phase 2)

Enables in-app audio capture as an alternative to importing a file. Output feeds directly into the existing pipeline.

### Capture Strategy

Two audio streams mixed into one `AudioContext` destination:

| Stream | API | Permission required |
|--------|-----|-------------------|
| Microphone | `navigator.mediaDevices.getUserMedia({ audio: true })` | Microphone (all platforms) |
| System audio | `desktopCapturer.getSources()` + `getUserMedia` with `chromeMediaSource: 'desktop'` | Screen recording (macOS only) |

`MediaRecorder` records the mixed destination. On stop, chunks are streamed via IPC to main process and written directly to disk — avoids holding full recording in memory.

### Platform Notes

- **macOS**: system audio requires `com.apple.security.screen-recording` entitlement in packaged app. Add to `electron-builder.yml` before shipping.
- **Windows/Linux**: `desktopCapturer` accesses WASAPI loopback / PulseAudio monitor — no extra entitlements needed.
- Captures all system audio, not app-specific. Users should use headphones to avoid mic echo.

### Planned IPC Channels (not yet registered)

| Channel | Direction | Description |
|---------|-----------|-------------|
| `get-desktop-sources` | renderer → main | Returns `desktopCapturer.getSources()` result |
| `recording-chunk` | renderer → main | Stream audio chunk (ArrayBuffer) to disk |
| `recording-stop` | renderer → main | Finalize file, convert WebM → WAV via ffmpeg, enqueue for pipeline |
| `recording-cancel` | renderer → main | Discard in-progress recording |
| `list-recordings` | renderer → main | Returns saved recordings from output dir |
| `delete-recording` | renderer → main | Delete recording file by path |

### File Flow

```
Renderer (MediaRecorder)
  → IPC chunks → main writes to outputDir/Recordings/<timestamp>.webm
  → recording-stop: ffmpeg converts .webm → .wav
  → wav path added to processing queue (same as file drag-drop)
```

### Tier Rollout

- **Tier 1**: microphone-only recording — no entitlements, works on all platforms
- **Tier 2**: system audio mix via `desktopCapturer` — requires macOS entitlement in packaged build

## Build Output

electron-vite compiles to `out/`:
- `out/main/index.js` — bundled main process (CJS, includes pipeline + utils)
- `out/preload/index.js` — bundled preload script

electron-builder packages `out/` + `src/renderer/` (static) + `resources/` + `assets/` into platform distributables.

## Build Matrix

| Platform | Arch | Binary requirement | Output | Notes |
|---------|------|--------------------|--------|-------|
| macOS (release) | universal | Universal fat binary (arm64 + x64 via `lipo`) | Single DMG | Runs on all Macs |
| macOS (dev) | host arch | Any compatible single-arch binary | DMG for current machine | Use `build:mac:dev` |
| Windows | x64 | x64 exe + `whisper.dll` + `SDL2.dll` | NSIS installer | CUDA optional |
| Linux | x64 | x64 binary | AppImage | arm64 unsupported for now |

### Why Universal Binary for macOS

macOS has two CPU architectures in active use: arm64 (Apple Silicon, M1–M4) and x64 (Intel). A single-arch binary silently fails on the other architecture. Universal binaries embed both slices; one DMG works on all Macs.

Build command: `npm run build:mac` (requires universal binaries in `bin/darwin/`).
Dev shortcut: `npm run build:mac:dev` (host arch only, no `lipo` required).

### Binary Path Resolution

`src/main/utils/binary-paths.js` is the single source of truth for all binary and model path resolution. Used by `SetupManager`, `TranscriptionModule`, and `DiarizationModule`. Logic:

- **Dev** (`!app.isPackaged`): `<project>/bin/<platform>/`
- **Packaged**: tries `process.resourcesPath/bin/<platform>/` first, falls back to two alternative paths, logs a warning if none found

`PLATFORM_DIR` constant: `'win32'` | `'linux'` | `'darwin'`

### macOS Code Signing

Packaged app requires signing and notarization to pass Gatekeeper. Entitlements are defined in `build/entitlements.mac.plist`:
- `com.apple.security.device.microphone` — recording feature Tier 1
- `com.apple.security.screen-recording` — recording feature Tier 2 (system audio)

See `docs/CONTRIBUTING.md` for signing environment variables.
