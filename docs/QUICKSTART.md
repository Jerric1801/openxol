# Quick Start Guide

## Initial Setup

### 1. Install Dependencies

```bash
cd meeting-analysis-app
npm install
```

### 2. Add Required Binaries

You need to add whisper.cpp and ffmpeg binaries for your platform:

#### macOS (darwin)
```bash
# Download whisper.cpp binary
# Place it at: bin/darwin/whisper

# Download ffmpeg binary  
# Place it at: bin/darwin/ffmpeg

# Make them executable
chmod +x bin/darwin/whisper
chmod +x bin/darwin/ffmpeg
```

#### Windows (win32)
- Download `whisper.exe` → Place at `bin/win32/whisper.exe`
- Download `ffmpeg.exe` → Place at `bin/win32/ffmpeg.exe`

#### Linux
- Download `whisper` → Place at `bin/linux/whisper`
- Download `ffmpeg` → Place at `bin/linux/ffmpeg`
- Make executable: `chmod +x bin/linux/whisper bin/linux/ffmpeg`

### 3. Add Whisper Models

Download Whisper models from: https://github.com/ggerganov/whisper.cpp/tree/master/models

Place them in `resources/models/whisper/`:
- `ggml-base.en.bin` (recommended for English)
- `ggml-small.en.bin`
- `ggml-medium.en.bin`

Or multilingual models:
- `ggml-base.bin`
- `ggml-small.bin`
- `ggml-medium.bin`

### 4. Configure Gemini API Key

1. Get an API key from: https://makersuite.google.com/app/apikey
2. Run the app: `npm start`
3. Click "Configuration" in the UI
4. Enter your API key in the "AI Analysis" section
5. Click "Save Configuration"

## Running the App

### Development Mode

```bash
npm run dev
```

This will:
- Start the Electron app
- Open DevTools automatically
- Show debug logs

### Production Mode

```bash
npm start
```

## Building for Distribution

### Build for Current Platform

```bash
npm run build
```

### Build for Specific Platforms

```bash
npm run build:mac    # macOS DMG
npm run build:win    # Windows NSIS installer
npm run build:linux  # Linux AppImage
```

Built applications will be in the `build/` directory.

## Testing

1. **Test File Upload**: Drag and drop an audio file or click to browse
2. **Test Configuration**: Open config panel and verify settings save
3. **Test Processing**: Upload a short audio file and verify it processes
4. **Test Results**: Check that transcript and analysis appear correctly

## Troubleshooting

### "Binary not found" Error

- Verify binaries are in the correct platform directory
- Check file permissions (make executable on Unix systems)
- Ensure binary names match exactly (`whisper`, `whisper.exe`, etc.)

### "Model not found" Error

- Verify model files are in `resources/models/whisper/`
- Check model naming: `ggml-{model}.bin`
- Ensure model name matches config (e.g., `base.en` → `ggml-base.en.bin`)

### "API Key" Error

- Verify Gemini API key is set in Configuration
- Check API key is valid and has quota
- Ensure internet connection for API calls

### App Won't Start

- Check Node.js version: `node --version` (should be v16+)
- Reinstall dependencies: `rm -rf node_modules && npm install`
- Check for error messages in terminal

## Next Steps

- See `README.md` for full documentation
- Check `app/docs/implementation-plan.md` for architecture details
- Customize UI in `src/renderer/`
- Modify pipeline logic in `src/pipeline/`




