const https = require('https');
const fs = require('fs'); // Use non-promise fs for streams
const fsPromises = require('fs').promises;
const path = require('path');
const { app } = require('electron');
const log = require('electron-log');

// Helper to ensure directory exists
const ensureDir = async (dir) => {
  try {
    await fsPromises.access(dir);
  } catch {
    await fsPromises.mkdir(dir, { recursive: true });
  }
};

class SetupManager {
  constructor() {
    this.setupDataPath = path.join(app.getPath('userData'), 'setup.json');
    // In production, binaries are inside the app bundle
    this.binariesPath = this.getBinariesPath();
    // Models go in user data so they persist across updates
    this.modelsPath = path.join(app.getPath('userData'), 'models', 'whisper');
  }

  getBinariesPath() {
    const platform = process.platform === 'win32' ? 'win32' : 'darwin'; // Simplified for Mac/Win
    
    if (app.isPackaged) {
      // In packaged app, binaries should be in resources folder (outside asar)
      // Try multiple possible locations
      const possiblePaths = [
        path.join(process.resourcesPath, 'bin', platform), // Standard location
        path.join(app.getAppPath(), '..', 'bin', platform), // Alternative location
        path.join(process.resourcesPath, '..', 'bin', platform) // Fallback
      ];
      
      // Return the first path (standard location)
      // The checkBinary method will verify if it exists
      const primaryPath = possiblePaths[0];
      log.info(`Packaged app - looking for binaries at: ${primaryPath}`);
      log.info(`process.resourcesPath: ${process.resourcesPath}`);
      log.info(`app.getAppPath(): ${app.getAppPath()}`);
      return primaryPath;
    } else {
      // Development mode
      return path.join(__dirname, '../../bin', platform);
    }
  }

  getBinaryPath(name) {
    const filename = process.platform === 'win32' ? `${name}.exe` : name;
    return path.join(this.binariesPath, filename);
  }

  async checkFileExists(filePath) {
    try {
      await fsPromises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async checkSetupComplete() {
    // Fast check: Do files exist on disk?
    const whisperPath = this.getBinaryPath('whisper');
    const ffmpegPath = this.getBinaryPath('ffmpeg');
    const modelPath = path.join(this.modelsPath, 'ggml-base.en.bin');
    
    const whisperOk = await this.checkFileExists(whisperPath);
    const ffmpegOk = await this.checkFileExists(ffmpegPath);
    const modelOk = await this.checkFileExists(modelPath);
    
    const missing = [];
    if (!whisperOk) missing.push('whisper binary');
    if (!ffmpegOk) missing.push('ffmpeg binary');
    if (!modelOk) missing.push('AI Model (base.en)');
    
    return {
      complete: whisperOk && ffmpegOk && modelOk,
      binaries: { whisper: whisperOk, ffmpeg: ffmpegOk },
      models: { 'base.en': modelOk },
      missing,
      summary: missing.length === 0
        ? 'All components are ready!'
        : `Missing: ${missing.join(', ')}`
    };
  }

  // Legacy methods - kept for compatibility but use checkFileExists internally
  async checkBinary(name) {
    const binaryPath = this.getBinaryPath(name);
    return await this.checkFileExists(binaryPath);
  }

  async checkModel(modelName) {
    const modelPath = path.join(this.modelsPath, `ggml-${modelName}.bin`);
    return await this.checkFileExists(modelPath);
  }

  /**
   * Downloads the model with robust redirect handling
   * Fixed: Proper stream handling to prevent "zip bomb" issues
   */
  async downloadModel(modelName, onProgress) {
    const fileName = `ggml-${modelName}.bin`;
    const destPath = path.join(this.modelsPath, fileName);
    // Use HuggingFace resolve URL which handles redirects well
    const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${fileName}`;

    // Check if model already exists
    if (await this.checkFileExists(destPath)) {
      log.info(`Model ${modelName} already exists at ${destPath}`);
      return destPath;
    }

    await ensureDir(this.modelsPath);

    return new Promise((resolve, reject) => {
      const download = (downloadUrl) => {
        https.get(downloadUrl, (response) => {
          // 1. Handle Redirects (301, 302)
          if (response.statusCode === 301 || response.statusCode === 302) {
            log.info(`Redirecting to: ${response.headers.location}`);
            return download(response.headers.location);
          }

          if (response.statusCode !== 200) {
            return reject(new Error(`Download failed: HTTP ${response.statusCode}`));
          }

          const totalSize = parseInt(response.headers['content-length'], 10);
          let downloaded = 0;
          const fileStream = fs.createWriteStream(destPath);

          response.on('data', (chunk) => {
            downloaded += chunk.length;
            fileStream.write(chunk);
            if (onProgress && totalSize) {
              onProgress({
                step: 'model',
                progress: (downloaded / totalSize) * 100,
                message: `Downloading Model... ${Math.round((downloaded / totalSize) * 100)}%`
              });
            }
          });

          response.on('end', () => {
            fileStream.end();
            fileStream.on('finish', () => {
              log.info(`Model downloaded successfully to ${destPath}`);
              resolve(destPath);
            });
          });

          fileStream.on('error', (err) => {
            fsPromises.unlink(destPath).catch(() => {}); // Delete corrupted file
            reject(err);
          });
        }).on('error', (err) => {
          fsPromises.unlink(destPath).catch(() => {});
          reject(err);
        });
      };

      log.info(`Starting download from ${url}`);
      download(url);
    });
  }

  async performSetup(onProgress) {
    // 1. Verify Binaries (We assume they are bundled!)
    const whisperPath = this.getBinaryPath('whisper');
    const ffmpegPath = this.getBinaryPath('ffmpeg');
    
    if (!(await this.checkFileExists(whisperPath))) {
      const errorMsg = `Critical: Whisper binary not found at ${whisperPath}`;
      log.error(errorMsg);
      if (onProgress) {
        onProgress({ step: 'error', message: errorMsg, progress: 0 });
      }
      throw new Error(errorMsg);
    }

    if (!(await this.checkFileExists(ffmpegPath))) {
      const errorMsg = `Critical: FFmpeg binary not found at ${ffmpegPath}`;
      log.error(errorMsg);
      if (onProgress) {
        onProgress({ step: 'error', message: errorMsg, progress: 0 });
      }
      throw new Error(errorMsg);
    }

    log.info('Binaries verified. Starting model download...');

    // 2. Download Model
    try {
      if (onProgress) {
        onProgress({ step: 'model', message: 'Starting download...', progress: 0 });
      }
      
      await this.downloadModel('base.en', onProgress);
      
      if (onProgress) {
        onProgress({
          step: 'model',
          message: 'Model ready',
          progress: 100
        });
      }
    } catch (error) {
      log.error('Model download failed:', error);
      const errorMsg = `Failed to download AI Model: ${error.message}`;
      if (onProgress) {
        onProgress({ step: 'error', message: errorMsg, progress: 0 });
      }
      throw error;
    }

    // 3. Verify model was downloaded successfully
    const modelPath = path.join(this.modelsPath, 'ggml-base.en.bin');
    if (!(await this.checkFileExists(modelPath))) {
      const errorMsg = 'Model download completed but file not found';
      log.error(errorMsg);
      throw new Error(errorMsg);
    }

    log.info('Setup completed successfully');
    
    if (onProgress) {
      onProgress({
        step: 'complete',
        message: 'Setup complete!',
        progress: 100
      });
    }
    
    return { success: true };
  }

  async getSetupStatus() {
    try {
      const data = await fs.readFile(this.setupDataPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return { completed: false };
    }
  }

  getInstallationInstructions(name) {
    const platform = process.platform;
    
    if (name === 'whisper') {
      if (platform === 'darwin') {
        return `To install Whisper on macOS:

Option 1 - Build from source (recommended):
1. Open Terminal
2. Navigate to the whisper.cpp directory in this project
3. Run: mkdir -p build && cd build && cmake .. && make
4. Copy the binary: cp build/bin/whisper-cli ../../meeting-analysis-app/bin/darwin/whisper
5. Make it executable: chmod +x ../../meeting-analysis-app/bin/darwin/whisper

Option 2 - Download pre-built binary:
Visit https://github.com/ggerganov/whisper.cpp/releases
Download the macOS binary and extract it to: bin/darwin/whisper`;
      } else if (platform === 'win32') {
        return `To install Whisper on Windows:
1. Visit https://github.com/ggerganov/whisper.cpp/releases
2. Download the Windows binary (whisper.exe)
3. Place it in: bin/win32/whisper.exe`;
      }
    } else if (name === 'ffmpeg') {
      if (platform === 'darwin') {
        return `To install FFmpeg on macOS:

Option 1 - Using Homebrew (recommended):
1. Open Terminal
2. Run: brew install ffmpeg
3. Find the binary: which ffmpeg
4. Copy it to: bin/darwin/ffmpeg
5. Make it executable: chmod +x bin/darwin/ffmpeg

Option 2 - Download manually:
1. Visit https://evermeet.cx/ffmpeg/
2. Download ffmpeg for macOS
3. Extract and place in: bin/darwin/ffmpeg
4. Make it executable: chmod +x bin/darwin/ffmpeg`;
      } else if (platform === 'win32') {
        return `To install FFmpeg on Windows:
1. Visit https://www.gyan.dev/ffmpeg/builds/
2. Download "ffmpeg-release-essentials.zip"
3. Extract and place ffmpeg.exe in: bin/win32/ffmpeg.exe`;
      }
    }
    
    return 'Please ensure the binary is included in the app bundle.';
  }

  getMissingComponentsSummary() {
    const missing = [];
    // This will be populated by checkSetupComplete
    return missing;
  }
}

module.exports = SetupManager;
