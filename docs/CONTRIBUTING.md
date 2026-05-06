# Contributing to OpenXol

## Dev Environment Setup

### Prerequisites

- Node.js ≥ 18
- Platform binaries placed in `bin/` (see below)

### Getting Binaries for Development

In dev mode, place any arch-compatible binary for your machine. Distribution builds have stricter requirements (see Build Matrix below).

**macOS (Apple Silicon or Intel):**
```bash
# whisper.cpp — build from source
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp && mkdir build && cd build
cmake -DGGML_METAL=ON .. && make -j   # Apple Silicon
# cmake .. && make -j                  # Intel
cp build/bin/whisper-cli <project>/bin/darwin/whisper
chmod +x <project>/bin/darwin/whisper

# ffmpeg — use Homebrew
brew install ffmpeg
cp $(which ffmpeg) bin/darwin/ffmpeg
chmod +x bin/darwin/ffmpeg
```

**Windows (x64):**
- whisper.exe: download from https://github.com/ggerganov/whisper.cpp/releases → place in `bin/win32/whisper.exe`
- Also required alongside it: `whisper.dll`, `SDL2.dll`
- ffmpeg.exe: download from https://www.gyan.dev/ffmpeg/builds/ → place in `bin/win32/ffmpeg.exe`

**Linux (x64):**
```bash
# whisper.cpp
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp && mkdir build && cd build && cmake .. && make -j
cp build/bin/whisper-cli <project>/bin/linux/whisper
chmod +x <project>/bin/linux/whisper

# ffmpeg
sudo apt install ffmpeg   # or equivalent
cp $(which ffmpeg) bin/linux/ffmpeg
chmod +x bin/linux/ffmpeg
```

**Whisper model** downloads automatically on first run. Or place manually at `userData/models/whisper/ggml-base.en.bin`.

### Install and Run

```bash
npm install
npm run dev        # TypeScript watch + Electron (DevTools open automatically)
```

### Commands

```bash
npm run typecheck      # TypeScript type-check without building
npm run build:mac:dev  # Package for current host arch (no universal binary needed)
npm run build:mac      # Package universal macOS DMG (requires universal binaries — see below)
npm run build:win      # Package Windows NSIS installer
npm run build:linux    # Package Linux AppImage
```

---

## Build Matrix

| Platform | Arch | Binary requirement | Output |
|---------|------|------------------|--------|
| macOS (release) | universal | Universal binary — arm64 + x64 slices via `lipo` | Single DMG, runs on all Macs |
| macOS (dev/test) | host arch | Any compatible binary | DMG for current machine only |
| Windows | x64 | x64 exe | NSIS installer |
| Linux | x64 | x64 binary | AppImage |

### Building Universal macOS Binaries

`build:mac` requires `bin/darwin/whisper` and `bin/darwin/ffmpeg` to be **universal binaries**. Build both arch slices then combine:

```bash
# whisper.cpp — build both slices
cd whisper.cpp
mkdir build-arm64 && cd build-arm64
cmake -DGGML_METAL=ON -DCMAKE_OSX_ARCHITECTURES=arm64 .. && make -j && cd ..
mkdir build-x64 && cd build-x64
cmake -DCMAKE_OSX_ARCHITECTURES=x86_64 .. && make -j && cd ..

# Combine into universal binary
lipo -create -output <project>/bin/darwin/whisper \
  build-arm64/bin/whisper-cli \
  build-x64/bin/whisper-cli
chmod +x <project>/bin/darwin/whisper

# Verify
lipo -info <project>/bin/darwin/whisper
# → Architectures in the fat file: arm64 x86_64
```

For ffmpeg, download universal static builds from https://evermeet.cx/ffmpeg/ (select "Universal").

### macOS Code Signing & Notarization

Required to pass Gatekeeper on other machines. Without signing, users see "app is damaged" warning.

Set these environment variables before `build:mac`:
```
APPLE_ID=your@apple.id
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=XXXXXXXXXX
```

electron-builder handles signing and notarization automatically when these are set.

### Windows GPU Acceleration (Optional)

whisper.cpp supports CUDA on Windows. To enable:
1. Build whisper.cpp with CUDA: `cmake -DGGML_CUDA=ON ..`
2. Include CUDA runtime DLLs alongside `whisper.dll`

Not required for basic functionality.

---

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
- OS, version, and CPU architecture (Apple Silicon / Intel / x64)
- App version (`Help → About`)
- Steps to reproduce
- Logs: `~/Library/Logs/OpenXol/` (macOS) · `%APPDATA%\OpenXol\logs\` (Windows) · `~/.config/OpenXol/logs/` (Linux)
