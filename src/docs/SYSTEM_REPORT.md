# Meeting Analysis Application - Technical System Report

## Executive Summary

The Meeting Analysis Application is a cross-platform desktop application built with Electron that provides automated transcription, speaker diarization, AI-powered analysis, and document generation for meeting audio recordings. The system processes audio files through a multi-stage pipeline, leveraging Whisper.cpp for transcription, Google Gemini AI for analysis, and generates comprehensive Word documents.

**Version:** 1.0.0  
**Platform:** Electron-based (macOS, Windows, Linux)  
**Architecture:** Main/Renderer Process with IPC Communication

---

## 1. System Architecture

### 1.1 High-Level Architecture

The application follows Electron's standard architecture pattern with clear separation between:

- **Main Process** (`src/main.js`): Node.js runtime managing application lifecycle, IPC handlers, and system integration
- **Renderer Process** (`src/renderer/`): Browser-based UI with HTML/CSS/JavaScript
- **Preload Script** (`src/preload.js`): Secure bridge exposing safe APIs to renderer
- **Pipeline Modules** (`src/pipeline/`): Core processing logic (transcription, diarization, analysis, document generation)
- **Utility Modules** (`src/utils/`): Configuration management, setup automation, file utilities

### 1.2 Process Communication

```
┌─────────────────┐
│  Renderer (UI)  │
│  HTML/CSS/JS    │
└────────┬────────┘
         │ IPC (via contextBridge)
         ▼
┌─────────────────┐
│  Preload Script │
│  (Security)     │
└────────┬────────┘
         │ IPC Invoke/Handle
         ▼
┌─────────────────┐
│  Main Process   │
│  Node.js        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Pipeline       │
│  Modules        │
└─────────────────┘
```

### 1.3 Security Model

- **Context Isolation:** Enabled (`contextIsolation: true`)
- **Node Integration:** Disabled (`nodeIntegration: false`)
- **Preload Script:** Exposes only safe APIs via `contextBridge`
- **IPC Communication:** All communication goes through validated IPC handlers

---

## 2. Component Breakdown

### 2.1 Main Process (`src/main.js`)

**Responsibilities:**
- Application lifecycle management
- Window creation and management
- IPC handler registration
- Initial setup detection
- File system operations (via Electron dialogs)

**Key Functions:**
- `createWindow()`: Creates BrowserWindow with appropriate HTML file
- IPC Handlers:
  - `get-config` / `save-config`: Configuration management
  - `select-audio-file` / `select-output-directory`: File dialogs
  - `process-audio`: Initiates processing pipeline
  - `check-setup-status` / `perform-setup`: Setup management
  - `get-app-version`: Version information

**Initialization Flow:**
1. App ready → Initialize ConfigManager (async)
2. Check setup status via SetupManager
3. Show setup screen if incomplete, else show main app
4. Register all IPC handlers

### 2.2 Preload Script (`src/preload.js`)

**Purpose:** Secure API bridge between renderer and main process

**Exposed APIs:**
- `electronAPI.getConfig()` / `saveConfig()`
- `electronAPI.selectAudioFile()` / `selectOutputDirectory()`
- `electronAPI.processAudio(audioPath, config)`
- `electronAPI.onProgress(callback)` - Event listener for progress updates
- `electronAPI.checkSetupStatus()` / `performSetup()`
- `electronAPI.getAppVersion()`

**Security:** Uses `contextBridge` to prevent direct Node.js access from renderer

### 2.3 Pipeline Modules

#### 2.3.1 Orchestrator (`pipeline/orchestrator.js`)

**Role:** Central coordinator for the processing pipeline

**Process Flow:**
```
Audio File
    ↓
[1] Transcription (required)
    ↓
[2] Diarization (optional)
    ↓
[3] Analysis (optional)
    ↓
[4] Document Generation (optional)
    ↓
Results Object
```

**Error Handling:** Graceful degradation - continues pipeline even if optional steps fail, collecting errors in `results.errors[]`

**Key Method:**
- `process(audioPath)`: Main entry point, returns comprehensive results object

#### 2.3.2 Transcription Module (`pipeline/transcription.js`)

**Technology:** Whisper.cpp (local binary execution)

**Responsibilities:**
- Audio format conversion (via FFmpeg)
- Whisper binary execution
- Model management
- JSON output parsing

**Process:**
1. Check binary/model existence (with helpful error messages)
2. Convert audio to WAV format if needed (16kHz, mono)
3. Execute Whisper with appropriate arguments
4. Parse JSON output
5. Return structured transcript object

**Configuration:**
- Model selection (base.en, small.en, medium.en, multilingual variants)
- Language specification
- GPU usage flag

**Output Format:**
```javascript
{
  text: string,
  segments: Array<{text, start, end, ...}>,
  language: string,
  raw: object
}
```

#### 2.3.3 Diarization Module (`pipeline/diarization.js`)

**Methods:**
1. **Whisper Native** (`whisper-native`): Uses Whisper.cpp's built-in diarization
2. **Gemini Inference** (`gemini`): Fallback using AI to identify speakers from transcript

**Process:**
- Checks for Whisper binary (shared with transcription)
- Executes Whisper with `--diarize` flag
- Extracts speaker information from segments
- Returns enhanced transcript with speaker labels

**Output Format:**
```javascript
{
  text: string,
  segments: Array<{text, speaker, start, end, ...}>,
  speakers: Array<string>,
  raw: object
}
```

#### 2.3.4 Analysis Module (`pipeline/analysis.js`)

**Technology:** Google Gemini AI (via `@google/generative-ai`)

**Responsibilities:**
- AI-powered meeting analysis
- Structured response parsing
- API key management

**Analysis Sections:**
1. **Meeting Synthesis**: Summary of topics, decisions, key points
2. **Action Items**: Tasks with assignees and timelines
3. **Critique & Analysis**: Quality assessment and improvement areas
4. **Key Insights**: Learnings and strategic considerations

**Process:**
1. Build structured prompt with transcript
2. Send to Gemini API
3. Parse structured response using regex
4. Return parsed analysis object

**Configuration:**
- API key (required)
- Model selection (gemini-1.5-flash, gemini-1.5-pro)
- Enabled/disabled toggle

**Output Format:**
```javascript
{
  raw: string,
  structured: {
    synthesis: string,
    actionItems: string,
    critique: string,
    insights: string
  },
  synthesis: string,
  actionItems: string,
  critique: string,
  insights: string
}
```

#### 2.3.5 Document Generation Module (`pipeline/docx-gen.js`)

**Technology:** `docx` library (Word document generation)

**Responsibilities:**
- Generate comprehensive Word documents
- Format sections with proper headings
- Include speaker analysis if available
- Handle transcript formatting

**Document Structure:**
1. Title: "Meeting Analysis Report"
2. Meeting Synthesis (Heading 1)
3. Action Items (Heading 1)
4. Critique & Analysis (Heading 1)
5. Key Insights (Heading 1)
6. Full Transcript (Heading 1)
7. Speaker Analysis (Heading 1, if diarized)

**Features:**
- Configurable speaker analysis inclusion
- Timestamped output filenames
- Proper paragraph formatting
- Speaker labels in transcript

### 2.4 Utility Modules

#### 2.4.1 Config Manager (`utils/config-manager.js`)

**Technology:** `electron-store` (ES Module, dynamically imported)

**Responsibilities:**
- Persistent configuration storage
- Default configuration management
- Configuration validation

**Storage Location:** `app.getPath('userData')/config.json`

**Default Configuration:**
```javascript
{
  transcription: {
    model: 'base.en',
    language: '',
    useGpu: true
  },
  diarization: {
    enabled: false,
    method: 'whisper-native'
  },
  analysis: {
    enabled: true,
    apiKey: '',
    model: 'gemini-1.5-flash'
  },
  document: {
    enabled: true,
    includeToc: true,
    includeSpeakerAnalysis: true
  },
  output: {
    directory: '~/Documents/Meeting Analysis',
    useTimestampedDirs: true
  }
}
```

**Key Features:**
- Async initialization (handles ES Module import)
- Initialization state checking
- Safe default directory resolution

#### 2.4.2 Setup Manager (`utils/setup-manager.js`)

**Responsibilities:**
- Binary detection and installation
- Model download management
- System binary detection (Homebrew, PATH)
- Progress reporting
- Installation instructions generation

**Setup Components:**
1. **Whisper Binary**: Transcription engine
2. **FFmpeg Binary**: Audio format converter
3. **Whisper Model**: AI model file (ggml-base.en.bin)

**Detection Strategy:**
1. Check bundled binaries (app bundle)
2. Check system binaries (PATH, Homebrew)
3. Download if URL available
4. Provide installation instructions if all fail

**Platform Support:**
- macOS (darwin): Homebrew detection, download URLs
- Windows (win32): Bundled binaries, download URLs
- Linux: Static builds, download URLs

**Key Methods:**
- `checkSetupComplete()`: Comprehensive status check
- `checkBinary(name)`: Binary existence check with system fallback
- `checkSystemBinary(name)`: System PATH detection
- `downloadBinary(name, onProgress)`: Download with progress
- `getInstallationInstructions(name)`: Platform-specific instructions

#### 2.4.3 File Utils (`utils/file-utils.js`)

**Static utility class for file operations:**

- `ensureDirectoryExists()`: Recursive directory creation
- `writeFile()` / `readFile()`: File I/O
- `getFileExtension()`: Extension extraction
- `getFileNameWithoutExtension()`: Filename parsing
- `fileExists()`: Existence checking
- `formatFileSize()`: Human-readable size formatting

### 2.5 Renderer Process (UI)

#### 2.5.1 Main Application (`renderer/index.html` + `js/app.js`)

**Components:**
- **File Upload Area**: Drag-and-drop or click-to-browse
- **Configuration Panel**: Collapsible settings panel
- **Processing Queue**: Real-time status of files being processed
- **Results Section**: Tabbed display of results

**File Handler (`js/file-handler.js`):**
- Queue management
- File addition (drag-drop, file dialog)
- Status tracking (pending, processing, completed, error)
- Progress display

**App Controller (`js/app.js`):**
- Queue polling (1-second interval)
- Processing orchestration
- Status updates
- Error handling

**Config Manager (`js/config.js`):**
- UI configuration management
- Load/save from main process
- Form synchronization
- Default configuration

**Results Manager (`js/results.js`):**
- Tab management (Transcript, Analysis, Downloads)
- Result display formatting
- Download functionality (TXT, DOCX)
- Text formatting and escaping

#### 2.5.2 Setup Screen (`renderer/setup.html` + `js/setup.js`)

**Purpose:** First-run setup wizard

**Components:**
- Whisper binary setup (with progress)
- FFmpeg binary setup (with progress)
- Model download (with progress)
- Error display with installation instructions

**Features:**
- Real-time progress updates via IPC
- Error handling with formatted instructions
- Success/failure status indicators
- Continue button when complete

---

## 3. Data Flow

### 3.1 Complete Processing Flow

```
User Action: Upload Audio File
    ↓
[Renderer] FileHandler.addToQueue()
    ↓
[Renderer] App.processNextFile() (polling)
    ↓
[IPC] electronAPI.processAudio(audioPath, config)
    ↓
[Main] ipcMain.handle('process-audio')
    ↓
[Pipeline] MeetingPipeline.process(audioPath)
    ↓
[Pipeline] TranscriptionModule.transcribe()
    ├─→ Check binaries
    ├─→ Convert audio (FFmpeg)
    └─→ Execute Whisper
    ↓
[Pipeline] DiarizationModule.diarize() [if enabled]
    └─→ Execute Whisper with --diarize
    ↓
[Pipeline] AnalysisModule.analyze() [if enabled]
    └─→ Call Gemini API
    ↓
[Pipeline] DocxGenModule.generateReport() [if enabled]
    └─→ Generate Word document
    ↓
[Main] Return results object
    ↓
[IPC] Return {success: true, result: {...}}
    ↓
[Renderer] ResultsManager.displayResults()
    ↓
[UI] Display in tabs
```

### 3.2 Configuration Flow

```
User modifies settings in UI
    ↓
[Renderer] ConfigManager.getConfigFromUI()
    ↓
[IPC] electronAPI.saveConfig(config)
    ↓
[Main] ConfigManager.saveConfig()
    ↓
[Utils] electron-store.set(config)
    ↓
[Storage] Persisted to disk
```

### 3.3 Setup Flow

```
App Launch
    ↓
[Main] SetupManager.checkSetupComplete()
    ├─→ Check binaries
    ├─→ Check models
    └─→ Return status
    ↓
If incomplete → Show setup.html
    ↓
User clicks "Start Setup"
    ↓
[Renderer] SetupUI.startSetup()
    ↓
[IPC] electronAPI.performSetup()
    ↓
[Main] SetupManager.performSetup()
    ├─→ Download/Copy binaries
    ├─→ Download models
    └─→ Send progress updates
    ↓
[IPC] progress-update events
    ↓
[Renderer] Update UI with progress
    ↓
Complete → Show continue button
```

---

## 4. Key Features

### 4.1 Core Features

1. **Audio Transcription**
   - Multiple format support (MP3, WAV, M4A, AAC, FLAC, OGG)
   - Automatic format conversion
   - Multiple Whisper model options
   - Language detection/selection

2. **Speaker Diarization**
   - Native Whisper diarization
   - Gemini-based fallback
   - Speaker identification and labeling

3. **AI-Powered Analysis**
   - Meeting synthesis
   - Action item extraction
   - Quality critique
   - Key insights generation

4. **Document Generation**
   - Comprehensive Word documents
   - Structured sections
   - Speaker analysis
   - Configurable output

5. **Automated Setup**
   - Binary detection
   - System binary fallback
   - Model downloading
   - Progress tracking
   - Installation instructions

### 4.2 User Experience Features

- **Drag-and-Drop**: Intuitive file upload
- **Processing Queue**: Multiple file handling
- **Real-Time Status**: Progress tracking
- **Error Handling**: Helpful error messages with instructions
- **Configuration**: Easy-to-use settings panel
- **Results Display**: Tabbed interface for different views
- **Downloads**: Export transcripts and analysis

### 4.3 Technical Features

- **Cross-Platform**: macOS, Windows, Linux support
- **Security**: Context isolation, no Node.js in renderer
- **Error Resilience**: Graceful degradation, error collection
- **Logging**: Comprehensive logging via electron-log
- **Configuration Persistence**: User settings saved automatically
- **System Integration**: File dialogs, system paths

---

## 5. Technical Details

### 5.1 Dependencies

**Core:**
- `electron`: ^28.0.0 (Desktop framework)
- `electron-store`: ^10.0.0 (Configuration storage)
- `electron-log`: ^5.0.1 (Logging)
- `@google/generative-ai`: ^0.21.0 (Gemini API)
- `docx`: ^8.5.0 (Word document generation)

**Build:**
- `electron-builder`: ^24.9.1 (Packaging)

**External Binaries:**
- Whisper.cpp: Local binary execution
- FFmpeg: Audio conversion

### 5.2 File Structure

```
meeting-analysis-app/
├── src/
│   ├── main.js                 # Main process
│   ├── preload.js             # Preload script
│   ├── pipeline/              # Processing modules
│   │   ├── orchestrator.js   # Pipeline coordinator
│   │   ├── transcription.js  # Whisper transcription
│   │   ├── diarization.js    # Speaker diarization
│   │   ├── analysis.js       # Gemini analysis
│   │   └── docx-gen.js       # Document generation
│   ├── utils/                 # Utility modules
│   │   ├── config-manager.js # Configuration
│   │   ├── setup-manager.js  # Setup automation
│   │   └── file-utils.js     # File utilities
│   └── renderer/             # UI components
│       ├── index.html         # Main UI
│       ├── setup.html         # Setup screen
│       ├── css/
│       │   └── styles.css     # Styling
│       └── js/
│           ├── app.js         # App controller
│           ├── config.js      # Config UI
│           ├── file-handler.js # File queue
│           ├── results.js     # Results display
│           └── setup.js       # Setup UI
├── bin/                       # Binary storage
│   ├── darwin/               # macOS binaries
│   ├── win32/                # Windows binaries
│   └── linux/                # Linux binaries
├── resources/
│   └── models/
│       └── whisper/          # Whisper models
└── package.json              # Project config
```

### 5.3 IPC Communication Patterns

**Request-Response (Invoke/Handle):**
- Configuration operations
- File selection
- Processing requests
- Setup operations

**Event-Based (Send/On):**
- Progress updates (main → renderer)
- Real-time status changes

### 5.4 Error Handling Strategy

**Levels:**
1. **Binary Detection**: Checks bundled → system → download → instructions
2. **Pipeline Errors**: Collected in `results.errors[]`, pipeline continues
3. **UI Errors**: Displayed with context and instructions
4. **Setup Errors**: Formatted with installation steps

**Error Types:**
- Missing binaries: Installation instructions
- API failures: Error messages with context
- File errors: Path and permission information
- Parse errors: Fallback mechanisms

---

## 6. Security Considerations

### 6.1 Electron Security

- **Context Isolation**: Prevents renderer from accessing Node.js directly
- **Node Integration Disabled**: No `require()` in renderer
- **Preload Script**: Controlled API exposure
- **IPC Validation**: All handlers validate input

### 6.2 API Key Management

- Stored in electron-store (encrypted on macOS)
- Never exposed to renderer directly
- Only sent to Gemini API from main process

### 6.3 File System Access

- User-initiated file selection only
- No arbitrary file system access
- Output directories user-specified

### 6.4 External Binary Execution

- Only executes known binaries (Whisper, FFmpeg)
- Binary paths validated
- No arbitrary command execution

---

## 7. Setup & Configuration

### 7.1 Initial Setup

**Automatic Detection:**
1. Check bundled binaries
2. Check system binaries (PATH, Homebrew)
3. Attempt download if URL available
4. Provide instructions if all fail

**Manual Setup:**
- Platform-specific instructions provided
- Multiple installation options
- Clear error messages

### 7.2 Configuration Options

**Transcription:**
- Model selection (6 options)
- Language specification
- GPU usage

**Diarization:**
- Enable/disable toggle
- Method selection (Whisper native / Gemini)

**Analysis:**
- Enable/disable toggle
- API key configuration
- Model selection (Flash / Pro)

**Output:**
- Directory selection
- Timestamped directories option

### 7.3 Storage Locations

**Configuration:** `app.getPath('userData')/config.json`  
**Setup Status:** `app.getPath('userData')/setup.json`  
**Binaries:** `app.getAppPath()/bin/{platform}/`  
**Models:** `app.getAppPath()/resources/models/whisper/`  
**Output:** User-specified directory (default: `~/Documents/Meeting Analysis`)

---

## 8. Performance Considerations

### 8.1 Processing Pipeline

- **Sequential Processing**: One file at a time
- **Optional Steps**: Can skip diarization/analysis for speed
- **Error Resilience**: Continues even if optional steps fail

### 8.2 Resource Usage

- **Whisper Models**: ~150MB (base.en) to ~1.5GB (medium)
- **Memory**: Varies by model size and audio length
- **CPU**: Transcription is CPU-intensive
- **Network**: Only for model download and Gemini API calls

### 8.3 Optimization Opportunities

- Parallel file processing (future)
- Model caching
- Progress streaming
- Incremental transcript display

---

## 9. Limitations & Future Enhancements

### 9.1 Current Limitations

1. **Single File Processing**: Queue processes one file at a time
2. **No Real-Time Progress**: Progress updates are limited
3. **Model Size**: Large models require significant disk space
4. **API Dependency**: Analysis requires internet connection
5. **Binary Management**: Requires manual binary setup or download

### 9.2 Potential Enhancements

1. **Parallel Processing**: Multiple files simultaneously
2. **Real-Time Transcription**: Streaming audio processing
3. **More Models**: Support for additional Whisper models
4. **Export Formats**: PDF, Markdown, JSON exports
5. **Cloud Storage**: Integration with cloud storage providers
6. **Meeting Templates**: Customizable report templates
7. **Speaker Identification**: Named speaker recognition
8. **Search Functionality**: Search within transcripts
9. **Batch Processing**: Process entire directories
10. **Progress Streaming**: Real-time transcription updates

---

## 10. Development & Build

### 10.1 Development Mode

```bash
npm run dev  # Opens with DevTools
```

### 10.2 Building

```bash
npm run build        # Current platform
npm run build:mac    # macOS DMG
npm run build:win    # Windows NSIS
npm run build:linux  # Linux AppImage
```

### 10.3 Build Configuration

- **macOS**: DMG with code signing support
- **Windows**: NSIS installer
- **Linux**: AppImage format
- **Files Included**: `src/**/*`, `bin/**/*`, `resources/**/*`

---

## 11. Conclusion

The Meeting Analysis Application is a comprehensive desktop solution for meeting transcription and analysis. It combines local processing (Whisper.cpp) with cloud AI (Gemini) to provide a complete workflow from audio input to formatted documents. The architecture prioritizes security, user experience, and error resilience, making it suitable for both technical and non-technical users.

The modular pipeline design allows for easy extension and customization, while the automated setup system reduces barriers to entry. The application successfully bridges the gap between powerful command-line tools and user-friendly desktop applications.

---

**Report Generated:** December 2024  
**System Version:** 1.0.0  
**Architecture:** Electron + Node.js + Whisper.cpp + Google Gemini AI

