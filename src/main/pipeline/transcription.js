const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const FileUtils = require('../utils/file-utils');
const binaryPaths = require('../utils/binary-paths');
const log = require('electron-log');

class TranscriptionModule {
  constructor(config) {
    this.config = config;
  }

  async convertAudio(audioPath) {
    // Check if already WAV format
    const ext = FileUtils.getFileExtension(audioPath);
    if (ext === 'wav') {
      // Even if already WAV, copy to working directory to ensure consistent location
      const workingDir = await FileUtils.getWorkingDirectory();
      const fileName = path.basename(audioPath);
      const outputPath = path.join(workingDir, fileName);
      await fs.copyFile(audioPath, outputPath);
      return outputPath;
    }

    // Convert to WAV using ffmpeg
    // Use working directory for output instead of source directory
    const workingDir = await FileUtils.getWorkingDirectory();
    const fileName = FileUtils.getFileNameWithoutExtension(path.basename(audioPath));
    const outputPath = path.join(workingDir, `${fileName}.wav`);
    const ffmpegPath = binaryPaths.getBinaryPath('ffmpeg');

    // Check if ffmpeg exists before trying to use it
    if (!(await FileUtils.fileExists(ffmpegPath))) {
      const SetupManager = require('../utils/setup-manager');
      const setupManager = new SetupManager();
      const instructions = setupManager.getInstallationInstructions('ffmpeg');
      throw new Error(`FFmpeg binary not found at: ${ffmpegPath}\n\n${instructions}\n\nPlease complete the setup first or install FFmpeg manually.`);
    }

    return new Promise(async (resolve, reject) => {
      const proc = spawn(ffmpegPath, [
        '-i', audioPath,
        '-ar', '16000',  // Sample rate 16kHz
        '-ac', '1',      // Mono
        '-y',            // Overwrite output file
        outputPath
      ]);

      let stderr = '';
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', async (code) => {
        const outputExists = await FileUtils.fileExists(outputPath);
        if (code === 0 || outputExists) {
          resolve(outputPath);
        } else {
          reject(new Error(`Audio conversion failed: ${stderr || 'Unknown error'}`));
        }
      });

      proc.on('error', (error) => {
        if (error.code === 'ENOENT') {
          const SetupManager = require('../utils/setup-manager');
          const setupManager = new SetupManager();
          const instructions = setupManager.getInstallationInstructions('ffmpeg');
          reject(new Error(`FFmpeg binary not found. ${instructions}`));
        } else {
          reject(new Error(`Failed to start ffmpeg: ${error.message}`));
        }
      });
    });
  }

  async transcribe(audioPath) {
    const whisperBin = binaryPaths.getBinaryPath('whisper');
    const modelPath = await binaryPaths.getModelPath(this.config.transcription.model || 'base.en');

    // Check if binaries exist
    if (!(await FileUtils.fileExists(whisperBin))) {
      const SetupManager = require('../utils/setup-manager');
      const setupManager = new SetupManager();
      const instructions = setupManager.getInstallationInstructions('whisper');
      throw new Error(`Whisper binary not found at: ${whisperBin}\n\n${instructions}\n\nPlease complete the setup first or install Whisper manually.`);
    }

    // Check if this is the Python whisper CLI (wrong binary)
    // Python whisper CLI uses --output_format/-f for output format (not file)
    // whisper.cpp uses -f/--file for input file and -oj/--output-json for JSON output
    try {
      const fs = require('fs');
      const { execSync } = require('child_process');
      
      // First check if it's a symlink pointing to Python whisper (fastest check)
      try {
        const stats = fs.lstatSync(whisperBin);
        if (stats.isSymbolicLink()) {
          const realPath = fs.realpathSync(whisperBin);
          log.info(`Binary is a symlink pointing to: ${realPath}`);
          if (realPath.includes('pyenv') || realPath.includes('python') || realPath.includes('pip') || realPath.includes('.pyenv')) {
            throw new Error(`Wrong binary detected: The binary at ${whisperBin} is a symlink to the Python whisper CLI (${realPath}), not whisper.cpp.\n\nPython whisper CLI uses different arguments than whisper.cpp. Please use the whisper.cpp binary instead.\n\nTo fix:\n1. Remove the symlink: rm "${whisperBin}"\n2. Build whisper.cpp: cd whisper.cpp && mkdir -p build && cd build && cmake .. && make\n3. Copy the binary: cp build/bin/whisper-cli ../../meeting-analysis-app/bin/darwin/whisper\n4. Make it executable: chmod +x ../../meeting-analysis-app/bin/darwin/whisper\n\nOr download a pre-built whisper.cpp binary from: https://github.com/ggerganov/whisper.cpp/releases`);
          }
        }
      } catch (symlinkError) {
        if (symlinkError.message.includes('Wrong binary detected')) {
          throw symlinkError;
        }
        // If lstat/realpath fails, continue with help text check
        log.debug('Symlink check failed, trying help text check:', symlinkError.message);
      }
      
      // Also check help output as fallback (catches non-symlink cases)
      // Use head to limit output size and avoid ENOBUFS errors
      const helpOutput = execSync(`"${whisperBin}" --help 2>&1 | head -50 || "${whisperBin}" -h 2>&1 | head -50 || true`, { 
        encoding: 'utf-8', 
        timeout: 2000,
        maxBuffer: 16384  // Increased buffer size (16KB)
      });
      
      // Python whisper CLI indicators (specific patterns from actual help output)
      // Check for key indicators in first 50 lines only
      const isPythonWhisper = helpOutput.includes('--output_format {txt,vtt,srt,tsv,json,all}') || 
                               helpOutput.includes('--output_format/-f') ||
                               (helpOutput.includes('usage: whisper') && helpOutput.includes('--output_format')) ||
                               (helpOutput.includes('--model MODEL') && helpOutput.includes('--output_format')) ||
                               helpOutput.includes('--output_dir OUTPUT_DIR');
      
      // whisper.cpp indicators
      const isWhisperCpp = helpOutput.includes('--output-json') || 
                           helpOutput.includes('-oj') ||
                           helpOutput.includes('whisper-cli') ||
                           (helpOutput.includes('--file FNAME') && helpOutput.includes('input audio file')) ||
                           helpOutput.includes('file0 file1 ...') ||
                           helpOutput.includes('supported audio formats:');
      
      if (isPythonWhisper && !isWhisperCpp) {
        throw new Error(`Wrong binary detected: The binary at ${whisperBin} is the Python whisper CLI, not whisper.cpp.\n\nPython whisper CLI uses different arguments than whisper.cpp. Please use the whisper.cpp binary instead.\n\nTo fix:\n1. Remove the symlink/binary: rm "${whisperBin}"\n2. Build whisper.cpp: cd whisper.cpp && mkdir -p build && cd build && cmake .. && make\n3. Copy the binary: cp build/bin/whisper-cli ../../meeting-analysis-app/bin/darwin/whisper\n4. Make it executable: chmod +x ../../meeting-analysis-app/bin/darwin/whisper\n\nOr download a pre-built whisper.cpp binary from: https://github.com/ggerganov/whisper.cpp/releases`);
      }
    } catch (error) {
      // If check fails, handle appropriately
      if (error.message.includes('Wrong binary detected')) {
        throw error;
      }
      
      // ENOBUFS or other execSync errors - log warning but don't fail
      // The binary might be valid, we just couldn't verify it
      if (error.code === 'ENOBUFS' || error.message.includes('ENOBUFS')) {
        log.warn('Binary validation skipped due to buffer size. Assuming binary is correct.');
        // Continue - we'll find out if it's wrong when we try to use it
      } else {
        // For other errors, log but don't fail - let the actual execution catch the error
        log.warn('Binary validation check failed:', error.message);
        log.warn('Will attempt to use binary anyway. If it fails, check the error message.');
      }
    }

    if (!(await FileUtils.fileExists(modelPath))) {
      // Provide helpful error message with setup instructions
      const errorMsg = `Whisper model not found.\n\n` +
        `The model needs to be downloaded before you can use transcription.\n\n` +
        `To download the model automatically:\n` +
        `1. Close this app\n` +
        `2. Reopen the app - the setup screen will appear automatically\n` +
        `3. Click "Start Setup" button\n` +
        `4. The model (~150MB) will download automatically\n\n` +
        `Or download manually from:\n` +
        `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin\n` +
        `And place it in: ${path.join(require('electron').app.getPath('userData'), 'models', 'whisper')}`;
      
      throw new Error(errorMsg);
    }

    // Convert audio if needed
    const wavPath = await this.convertAudio(audioPath);
    
    // Get working directory and set up output paths
    const workingDir = await FileUtils.getWorkingDirectory();
    const outputBaseName = FileUtils.getFileNameWithoutExtension(path.basename(wavPath));
    const jsonOutputPath = path.join(workingDir, `${outputBaseName}.json`);

    return new Promise(async (resolve, reject) => {
      // whisper.cpp CLI format: 
      // whisper-cli -m <model> -f <file> [options]
      // Output format flags: -otxt (text), -oj (JSON), -ovtt (VTT), -osrt (SRT), -otsv (TSV)
      // Use -of to specify output file path (without extension)
      // Note: The order matters - model and file should come before output format flags
      const args = [
        '-m', modelPath,  // Model path
        '-f', wavPath,    // Input audio file
        '-of', path.join(workingDir, outputBaseName),  // Output file path (without extension)
        '-oj',            // Output JSON format
        '-nt'             // No timestamps
      ];

      if (this.config.transcription.language) {
        args.push('-l', this.config.transcription.language);
      }

      log.info(`Running whisper.cpp: ${whisperBin} ${args.join(' ')}`);
      const proc = spawn(whisperBin, args);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        // Log progress
        log.debug('Whisper progress:', data.toString());
      });

      proc.on('close', async (code) => {
        if (code === 0) {
          try {
            // Wait a brief moment to ensure file is fully written (race condition fix)
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Check if JSON file exists before reading
            if (!(await FileUtils.fileExists(jsonOutputPath))) {
              log.warn(`JSON output file not found at: ${jsonOutputPath}`);
              log.info(`Attempting to read from stdout instead...`);
              throw new Error('JSON file not found, trying stdout fallback');
            }
            
            // Parse JSON output from specified path
            log.info(`Reading transcription JSON from: ${jsonOutputPath}`);
            const content = await fs.readFile(jsonOutputPath, 'utf-8');
            
            if (!content || content.trim().length === 0) {
              throw new Error('JSON file is empty');
            }
            
            const result = JSON.parse(content);
            log.info(`Parsed JSON successfully. Checking structure...`);
            
            // Extract text - handle different Whisper JSON formats
            let transcriptText = '';
            let segments = [];
            let language = '';
            
            // Format 1: Standard format with text and segments at root
            if (result.text) {
              transcriptText = result.text;
              segments = result.segments || [];
              language = result.language || '';
              log.info(`Found standard format: text length=${transcriptText.length}, segments=${segments.length}`);
            }
            // Format 2: Whisper.cpp format with transcription array
            else if (result.transcription && Array.isArray(result.transcription) && result.transcription.length > 0) {
              // Extract text from transcription array
              transcriptText = result.transcription
                .map(item => item.text || '')
                .filter(t => t && t.trim().length > 0)
                .join(' ');
              
              // Convert transcription array to segments format
              segments = result.transcription.map(item => ({
                text: item.text || '',
                start: item.offsets?.from ? item.offsets.from / 1000 : undefined,
                end: item.offsets?.to ? item.offsets.to / 1000 : undefined,
                timestamps: item.timestamps || {}
              }));
              
              language = result.result?.language || result.params?.language || '';
              log.info(`Found transcription array format: text length=${transcriptText.length}, segments=${segments.length}, language=${language}`);
            }
            // Format 3: Try segments array at root
            else if (result.segments && Array.isArray(result.segments) && result.segments.length > 0) {
              transcriptText = result.segments
                .map(s => s.text || '')
                .filter(t => t && t.trim().length > 0)
                .join(' ');
              segments = result.segments;
              language = result.language || '';
              log.info(`Found segments format: text length=${transcriptText.length}, segments=${segments.length}`);
            }
            
            // Log warning if still no text
            if (!transcriptText || transcriptText.trim().length === 0) {
              log.warn('Transcription completed but text is empty. JSON structure:', JSON.stringify(result, null, 2));
            }
            
            // Clean up temp files after successful read
            const filesToCleanup = [wavPath, jsonOutputPath];
            for (const filePath of filesToCleanup) {
              await FileUtils.cleanupFile(filePath);
            }
            
            resolve({
              text: transcriptText,
              segments: segments,
              language: language,
              raw: result
            });
          } catch (error) {
            log.error(`Failed to read JSON file: ${error.message}`);
            log.info(`JSON path was: ${jsonOutputPath}`);
            log.info(`Stdout length: ${stdout.length}, Stderr length: ${stderr.length}`);
            
            // Fallback: try to parse stdout as JSON
            if (stdout && stdout.trim().length > 0) {
              try {
                log.info('Attempting to parse stdout as JSON...');
                const result = JSON.parse(stdout);
                
                // Extract text - handle different Whisper JSON formats (same logic as file parsing)
                let transcriptText = '';
                let segments = [];
                let language = '';
                
                if (result.text) {
                  transcriptText = result.text;
                  segments = result.segments || [];
                  language = result.language || '';
                } else if (result.transcription && Array.isArray(result.transcription) && result.transcription.length > 0) {
                  transcriptText = result.transcription
                    .map(item => item.text || '')
                    .filter(t => t && t.trim().length > 0)
                    .join(' ');
                  segments = result.transcription.map(item => ({
                    text: item.text || '',
                    start: item.offsets?.from ? item.offsets.from / 1000 : undefined,
                    end: item.offsets?.to ? item.offsets.to / 1000 : undefined,
                    timestamps: item.timestamps || {}
                  }));
                  language = result.result?.language || result.params?.language || '';
                } else if (result.segments && Array.isArray(result.segments) && result.segments.length > 0) {
                  transcriptText = result.segments
                    .map(s => s.text || '')
                    .filter(t => t && t.trim().length > 0)
                    .join(' ');
                  segments = result.segments;
                  language = result.language || '';
                }
                
                // Still try to clean up files even if we used stdout fallback
                const filesToCleanup = [wavPath, jsonOutputPath];
                for (const filePath of filesToCleanup) {
                  await FileUtils.cleanupFile(filePath);
                }
                
                log.info(`Successfully parsed from stdout. Text length: ${transcriptText.length}`);
                resolve({
                  text: transcriptText,
                  segments: segments,
                  language: language,
                  raw: result
                });
              } catch (parseError) {
                log.error(`Failed to parse stdout as JSON: ${parseError.message}`);
                log.error(`Stdout content (first 500 chars): ${stdout.substring(0, 500)}`);
                
                // Clean up on error too
                const filesToCleanup = [wavPath, jsonOutputPath];
                for (const filePath of filesToCleanup) {
                  await FileUtils.cleanupFile(filePath);
                }
                reject(new Error(`Failed to parse transcription output: ${error.message}. Parse error: ${parseError.message}`));
              }
            } else {
              // Clean up on error
              const filesToCleanup = [wavPath, jsonOutputPath];
              for (const filePath of filesToCleanup) {
                await FileUtils.cleanupFile(filePath);
              }
              reject(new Error(`Failed to read transcription output: ${error.message}. JSON file not found and stdout is empty.`));
            }
          }
        } else {
          // Clean up on failure
          const filesToCleanup = [wavPath, jsonOutputPath];
          for (const filePath of filesToCleanup) {
            await FileUtils.cleanupFile(filePath);
          }
          reject(new Error(`Transcription failed with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', async (error) => {
        // Clean up on spawn error
        const filesToCleanup = [wavPath, jsonOutputPath];
        for (const filePath of filesToCleanup) {
          await FileUtils.cleanupFile(filePath);
        }
        reject(new Error(`Failed to start whisper: ${error.message}`));
      });
    });
  }
}

module.exports = TranscriptionModule;

