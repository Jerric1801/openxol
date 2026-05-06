# Contributing to OpenXol

## Dev Environment Setup

### Prerequisites

- Node.js ≥ 18
- macOS: place `bin/darwin/whisper` and `bin/darwin/ffmpeg` (see below)
- Windows: place `bin/win32/whisper.exe`, `bin/win32/ffmpeg.exe`, `bin/win32/whisper.dll`, `bin/win32/SDL2.dll`
- Linux: place `bin/linux/whisper` and `bin/linux/ffmpeg`

### Getting Binaries

whisper.cpp binary — build from source or download a release:
- Build: `cmake -B build && cmake --build build --config Release` in a whisper.cpp checkout, then copy `build/bin/whisper-cli` to `bin/<platform>/whisper`
- macOS: ensure binary is executable — `chmod +x bin/darwin/whisper`

ffmpeg — use the system binary or a static build:
- macOS: `brew install ffmpeg`, then `cp $(which ffmpeg) bin/darwin/ffmpeg`
- Windows: download from gyan.dev/ffmpeg/builds, copy `ffmpeg.exe`

The whisper model (`ggml-base.en.bin`) downloads automatically on first run via the setup wizard. Alternatively place it manually at `userData/models/whisper/ggml-base.en.bin` or `resources/models/whisper/ggml-base.en.bin`.

### Install and Run

```bash
npm install
npm run dev        # TypeScript watch + Electron (DevTools open automatically)
```

### Other Commands

```bash
npm run typecheck  # TypeScript type-check without building
npm run build      # Compile + package for current platform
```

## Making Changes

### Branch Naming

```
feat/<short-description>
fix/<short-description>
docs/<short-description>
chore/<short-description>
refactor/<short-description>
```

### Commit Format

[Conventional Commits](https://www.conventionalcommits.org/):
```
<type>(<scope>): <description>

feat(pipeline): add configurable diarization timeout
fix(setup): resolve Linux binary path mapping
docs(architecture): update IPC channel registry
```

### Pull Requests

- One logical change per PR
- Update `docs/ARCHITECTURE.md` if you add or rename IPC channels
- Pipeline changes (`src/main/pipeline/`) require tests (Phase 3: Vitest)
- Run `npm run typecheck` before pushing — CI will enforce this

## Reporting Issues

File issues on GitHub with:
- OS and version
- App version (`Help → About` or `npm run build` output)
- Steps to reproduce
- Relevant logs from `~/Library/Logs/OpenXol/` (macOS) or `%APPDATA%\OpenXol\logs\` (Windows)
