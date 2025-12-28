const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const FileUtils = require('../utils/file-utils');
const log = require('electron-log');

class DiarizationModule {
  constructor(config) {
    this.config = config;
    this.currentProcess = null; // Store process reference for cancellation
  }

  getBinaryPath() {
    const { app } = require('electron');
    const platform = process.platform;
    
    let platformDir;
    if (platform === 'darwin') {
      platformDir = 'darwin';
    } else if (platform === 'win32') {
      platformDir = 'win32';
    } else {
      platformDir = 'linux';
    }

    const binaryName = platform === 'win32' ? 'whisper.exe' : 'whisper';
    
    // In production, use app.getAppPath(), in development use __dirname
    const appPath = app.isPackaged 
      ? process.resourcesPath || app.getAppPath()
      : path.join(__dirname, '../..');
    
    return path.join(appPath, 'bin', platformDir, binaryName);
  }

  async getModelPath(modelName = 'base.en') {
    const { app } = require('electron');
    
    // Models are stored in userData so they persist across updates
    // Check userData first (downloaded models), then fallback to bundled
    const userDataPath = path.join(app.getPath('userData'), 'models', 'whisper', `ggml-${modelName}.bin`);
    
    // Check if model exists in userData
    if (await FileUtils.fileExists(userDataPath)) {
      return userDataPath;
    }
    
    // Fallback to bundled resources (if bundled with app)
    const appPath = app.isPackaged 
      ? process.resourcesPath || app.getAppPath()
      : path.join(__dirname, '../..');
    
    return path.join(appPath, 'resources', 'models', 'whisper', `ggml-${modelName}.bin`);
  }

  async diarize(audioPath, transcript) {
    // Use whisper.cpp native diarization (only supported method)
    if (this.config.diarization.method === 'whisper-native') {
      return await this.diarizeWithWhisper(audioPath);
    }

    // Default: return transcript with no diarization
    // Note: Gemini inference diarization removed - it cannot accurately identify
    // speakers from text alone without audio context
    return transcript;
  }

  async diarizeWithWhisper(audioPath) {
    const whisperBin = this.getBinaryPath();
    const modelPath = await this.getModelPath(this.config.transcription?.model || 'base.en');

    if (!(await FileUtils.fileExists(whisperBin))) {
      const SetupManager = require('../utils/setup-manager');
      const setupManager = new SetupManager();
      const instructions = setupManager.getInstallationInstructions('whisper');
      throw new Error(`Whisper binary not found at: ${whisperBin}\n\n${instructions}\n\nPlease complete the setup first or install Whisper manually.`);
    }

    // Check if this is the Python whisper CLI (wrong binary)
    try {
      const fsSync = require('fs');
      const { execSync } = require('child_process');
      
      // First check if it's a symlink pointing to Python whisper (fastest check)
      try {
        const stats = fsSync.lstatSync(whisperBin);
        if (stats.isSymbolicLink()) {
          const realPath = fsSync.realpathSync(whisperBin);
          if (realPath.includes('pyenv') || realPath.includes('python') || realPath.includes('pip') || realPath.includes('.pyenv')) {
            throw new Error(`Wrong binary detected: The binary at ${whisperBin} is a symlink to the Python whisper CLI (${realPath}), not whisper.cpp.\n\nPlease use the whisper.cpp binary. See transcription error for installation instructions.`);
          }
        }
      } catch (symlinkError) {
        if (symlinkError.message.includes('Wrong binary detected')) {
          throw symlinkError;
        }
      }
      
      // Also check help output as fallback (limit output to avoid ENOBUFS)
      const helpOutput = execSync(`"${whisperBin}" --help 2>&1 | head -50 || "${whisperBin}" -h 2>&1 | head -50 || true`, { 
        encoding: 'utf-8', 
        timeout: 2000,
        maxBuffer: 16384 
      });
      
      const isPythonWhisper = helpOutput.includes('--output_format') || 
                               helpOutput.includes('argument --output_format/-f') ||
                               (helpOutput.includes('usage: whisper') && !helpOutput.includes('whisper-cli'));
      
      const isWhisperCpp = helpOutput.includes('--output-json') || 
                           helpOutput.includes('-oj') ||
                           helpOutput.includes('whisper-cli') ||
                           helpOutput.includes('file0 file1 ...');
      
      if (isPythonWhisper && !isWhisperCpp) {
        throw new Error(`Wrong binary detected: The binary at ${whisperBin} is the Python whisper CLI, not whisper.cpp.\n\nPlease use the whisper.cpp binary. See transcription error for installation instructions.`);
      }
    } catch (error) {
      if (error.message.includes('Wrong binary detected')) {
        throw error;
      }
      // ENOBUFS or other errors - log but don't fail
      if (error.code === 'ENOBUFS' || error.message.includes('ENOBUFS')) {
        log.warn('Binary validation skipped due to buffer size.');
      } else {
        log.debug('Binary check skipped:', error.message);
      }
    }

    // Ensure audio is in WAV format and in working directory
    // If already WAV, copy to working directory; otherwise convert
    const ext = FileUtils.getFileExtension(audioPath);
    let wavPath;
    const workingDir = await FileUtils.getWorkingDirectory();
    
    if (ext === 'wav') {
      // Copy to working directory
      const fileName = path.basename(audioPath);
      wavPath = path.join(workingDir, `diarize_${fileName}`);
      await fs.copyFile(audioPath, wavPath);
    } else {
      // Convert to WAV using ffmpeg (reuse transcription module's logic)
      const TranscriptionModule = require('./transcription');
      const transcription = new TranscriptionModule(this.config);
      wavPath = await transcription.convertAudio(audioPath);
      // Note: convertAudio already puts file in working directory
    }

    // Set up output paths
    const outputBaseName = FileUtils.getFileNameWithoutExtension(path.basename(wavPath));
    const jsonOutputPath = path.join(workingDir, `${outputBaseName}.json`);

    return new Promise(async (resolve, reject) => {
      // whisper.cpp CLI format for diarization
      const args = [
        '-m', modelPath,    // Model path
        '-f', wavPath,      // Input audio file (in working directory)
        '-of', path.join(workingDir, outputBaseName),  // Output file path (without extension)
        '-di',              // Enable diarization (--diarize)
        '-oj'               // Output JSON format
      ];

      log.info(`Running whisper diarization: ${whisperBin} ${args.join(' ')}`);
      const proc = spawn(whisperBin, args);

      let stdout = '';
      let stderr = '';
      
      // Add timeout (30 minutes max for diarization)
      const timeoutMs = 30 * 60 * 1000; // 30 minutes
      const timeout = setTimeout(() => {
        if (!proc.killed) {
          log.error('Diarization timeout - killing process');
          proc.kill('SIGTERM');
          // Give it a moment to clean up
          setTimeout(() => {
            if (!proc.killed) {
              proc.kill('SIGKILL');
            }
          }, 5000);
          
          // Clean up temp files
          const filesToCleanup = [wavPath, jsonOutputPath];
          filesToCleanup.forEach(filePath => {
            FileUtils.cleanupFile(filePath).catch(() => {});
          });
          
          reject(new Error('Diarization timed out after 30 minutes. This may indicate an issue with the audio file or model.'));
        }
      }, timeoutMs);

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        log.debug('Whisper diarization progress:', data.toString());
      });

      proc.on('close', async (code) => {
        clearTimeout(timeout);
        this.currentProcess = null; // Clear process reference
        if (code === 0) {
          try {
            // Parse JSON output from file (preferred) or stdout (fallback)
            let result;
            try {
              const content = await fs.readFile(jsonOutputPath, 'utf-8');
              result = JSON.parse(content);
            } catch (fileError) {
              // Fallback to stdout parsing
              result = JSON.parse(stdout);
            }
            
            // Clean up temp files
            const filesToCleanup = [wavPath, jsonOutputPath];
            for (const filePath of filesToCleanup) {
              await FileUtils.cleanupFile(filePath);
            }
            
            resolve({
              text: result.text || '',
              segments: result.segments || [],
              speakers: this.extractSpeakers(result.segments),
              raw: result
            });
          } catch (error) {
            // Clean up on error
            const filesToCleanup = [wavPath, jsonOutputPath];
            for (const filePath of filesToCleanup) {
              await FileUtils.cleanupFile(filePath);
            }
            reject(new Error(`Failed to parse diarization output: ${error.message}`));
          }
        } else {
          // Clean up on failure
          const filesToCleanup = [wavPath, jsonOutputPath];
          for (const filePath of filesToCleanup) {
            await FileUtils.cleanupFile(filePath);
          }
          reject(new Error(`Diarization failed with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', async (error) => {
        clearTimeout(timeout);
        this.currentProcess = null; // Clear process reference
        // Clean up on spawn error
        const filesToCleanup = [wavPath, jsonOutputPath];
        for (const filePath of filesToCleanup) {
          await FileUtils.cleanupFile(filePath);
        }
        reject(new Error(`Failed to start whisper diarization: ${error.message}`));
      });
      
      // Store process reference for cancellation
      this.currentProcess = proc;
    });
  }
  
  cancel() {
    if (this.currentProcess && !this.currentProcess.killed) {
      log.info('Cancelling diarization process...');
      this.currentProcess.kill('SIGTERM');
      setTimeout(() => {
        if (!this.currentProcess.killed) {
          this.currentProcess.kill('SIGKILL');
        }
      }, 5000);
    }
  }


  extractSpeakers(segments) {
    if (!segments || !Array.isArray(segments)) {
      return [];
    }

    const speakers = new Set();
    segments.forEach(segment => {
      if (segment.speaker) {
        speakers.add(segment.speaker);
      }
    });

    return Array.from(speakers);
  }
}

module.exports = DiarizationModule;

