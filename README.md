# Meeting Analysis App

A standalone Electron application for transcribing and analyzing meeting recordings using Whisper.cpp and Google's Gemini API.

## Features

- 🎤 **Audio Transcription**: High-quality transcription using whisper.cpp
- 👥 **Speaker Diarization**: Identify different speakers (optional)
- 🤖 **AI Analysis**: Comprehensive meeting analysis using Gemini API
- 📄 **Document Generation**: Professional DOCX reports
- 🎨 **Modern GUI**: Beautiful, easy-to-use interface

## 🎉 Zero-Setup for End Users!

**For your friends**: Just download and run! The app automatically sets up everything on first launch.

**For developers**: See [DEPLOYMENT.md](DEPLOYMENT.md) and [AUTOMATIC_SETUP.md](AUTOMATIC_SETUP.md) for build instructions.

## Prerequisites (For Development)

If you're building the app yourself:

1. **Install Node.js** (v16 or higher)
2. **Add Binaries**: Place whisper.cpp and ffmpeg binaries in `bin/` directory (for bundling)
3. **Add Models**: Place Whisper models in `resources/models/whisper/` (for bundling)

## Setup (For Development)

### 1. Install Dependencies

```bash
npm install
```

### 2. Add Binaries (For Bundling)

Download and place the following binaries if you want to bundle them:

**macOS (darwin)**:
- `bin/darwin/whisper` - whisper.cpp binary
- `bin/darwin/ffmpeg` - ffmpeg binary

**Windows (win32)**:
- `bin/win32/whisper.exe` - whisper.cpp binary
- `bin/win32/ffmpeg.exe` - ffmpeg binary

**Linux**:
- `bin/linux/whisper` - whisper.cpp binary
- `bin/linux/ffmpeg` - ffmpeg binary

### 3. Add Whisper Models (For Bundling)

Download Whisper models and place them in `resources/models/whisper/`:

- `ggml-base.en.bin` (recommended default)
- `ggml-small.en.bin`
- `ggml-medium.en.bin`
- Or multilingual models: `ggml-base.bin`, `ggml-small.bin`, etc.

You can download models from: https://github.com/ggerganov/whisper.cpp/tree/master/models

**Note**: If you bundle binaries and models, users won't need to download anything!

### 4. Configure Gemini API Key

1. Get a Gemini API key from Google AI Studio
2. Open the app and go to Configuration
3. Enter your API key in the "AI Analysis" section

## Development

### Run in Development Mode

```bash
npm run dev
```

### Build for Production

```bash
# Build for current platform
npm run build

# Build for specific platform
npm run build:mac
npm run build:win
npm run build:linux
```

## Project Structure

```
meeting-analysis-app/
├── src/
│   ├── main.js              # Electron main process
│   ├── preload.js           # IPC bridge
│   ├── renderer/            # UI files
│   │   ├── index.html
│   │   ├── css/
│   │   └── js/
│   ├── pipeline/            # Processing modules
│   │   ├── orchestrator.js
│   │   ├── transcription.js
│   │   ├── diarization.js
│   │   ├── analysis.js
│   │   └── docx-gen.js
│   └── utils/               # Utilities
├── bin/                     # Platform binaries
├── resources/               # Models and resources
└── package.json
```

## Usage

1. **Launch the app**: Run `npm start` or launch the built application
2. **Upload audio**: Drag and drop audio files or click to browse
3. **Configure**: Set your preferences in the Configuration panel
4. **Process**: Files are automatically processed when added
5. **View results**: Check the Results section for transcripts and analysis
6. **Download**: Export transcripts, analysis, or full DOCX reports

## Supported Audio Formats

- MP3
- WAV
- M4A
- AAC
- FLAC
- OGG

## Configuration

The app stores configuration in your system's user data directory. You can:
- Enable/disable speaker diarization
- Configure AI analysis settings
- Set output directory
- Choose transcription model

## Troubleshooting

### Binaries Not Found

Make sure binaries are in the correct platform directory (`bin/darwin/`, `bin/win32/`, or `bin/linux/`).

### Models Not Found

Ensure Whisper models are in `resources/models/whisper/` with the correct naming format (`ggml-{model}.bin`).

### API Key Issues

Verify your Gemini API key is correct and sufficient quota.

## License

# meeting-analysis-app
