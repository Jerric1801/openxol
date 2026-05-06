import https from 'https'
import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import { app } from 'electron'
import log from 'electron-log'
import * as binaryPaths from './binary-paths'
import type { SetupStatus, SetupProgress } from '../../types/setup'

const ensureDir = async (dir: string): Promise<void> => {
  try {
    await fsPromises.access(dir)
  } catch {
    await fsPromises.mkdir(dir, { recursive: true })
  }
}

export class SetupManager {
  private setupDataPath: string
  private modelsPath: string

  constructor() {
    this.setupDataPath = path.join(app.getPath('userData'), 'setup.json')
    this.modelsPath = path.join(app.getPath('userData'), 'models', 'whisper')
  }

  getBinaryPath(name: string): string {
    return binaryPaths.getBinaryPath(name)
  }

  async checkFileExists(filePath: string): Promise<boolean> {
    try {
      await fsPromises.access(filePath)
      return true
    } catch {
      return false
    }
  }

  async checkSetupComplete(): Promise<SetupStatus> {
    const whisperPath = this.getBinaryPath('whisper')
    const ffmpegPath = this.getBinaryPath('ffmpeg')
    const modelPath = await binaryPaths.getModelPath('base.en')
    
    const whisperOk = await this.checkFileExists(whisperPath)
    const ffmpegOk = await this.checkFileExists(ffmpegPath)
    const modelOk = await this.checkFileExists(modelPath)
    
    const missing: string[] = []
    if (!whisperOk) missing.push('whisper binary')
    if (!ffmpegOk) missing.push('ffmpeg binary')
    if (!modelOk) missing.push('AI Model (base.en)')
    
    return {
      complete: whisperOk && ffmpegOk && modelOk,
      missing
    }
  }

  async downloadModel(modelName: string, onProgress?: (progress: any) => void): Promise<string> {
    const fileName = `ggml-${modelName}.bin`
    const destPath = path.join(this.modelsPath, fileName)
    const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${fileName}`

    if (await this.checkFileExists(destPath)) {
      log.info(`Model ${modelName} already exists at ${destPath}`)
      return destPath
    }

    await ensureDir(this.modelsPath)

    return new Promise((resolve, reject) => {
      const download = (downloadUrl: string): void => {
        https
          .get(downloadUrl, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
              log.info(`Redirecting to: ${response.headers.location}`)
              return download(response.headers.location!)
            }

            if (response.statusCode !== 200) {
              return reject(new Error(`Download failed: HTTP ${response.statusCode}`))
            }

            const totalSize = parseInt(response.headers['content-length'] || '0', 10)
            let downloaded = 0
            const fileStream = fs.createWriteStream(destPath)

            response.on('data', (chunk) => {
              downloaded += chunk.length
              fileStream.write(chunk)
              if (onProgress && totalSize) {
                onProgress({
                  step: 'model',
                  progress: (downloaded / totalSize) * 100,
                  message: `Downloading Model... ${Math.round((downloaded / totalSize) * 100)}%`
                })
              }
            })

            response.on('end', () => {
              fileStream.end()
              fileStream.on('finish', () => {
                log.info(`Model downloaded successfully to ${destPath}`)
                resolve(destPath)
              })
            })

            fileStream.on('error', (err) => {
              fsPromises.unlink(destPath).catch(() => {})
              reject(err)
            })
          })
          .on('error', (err) => {
            fsPromises.unlink(destPath).catch(() => {})
            reject(err)
          })
      }

      log.info(`Starting download from ${url}`)
      download(url)
    })
  }

  async performSetup(onProgress?: (progress: any) => void): Promise<{ success: boolean }> {
    const whisperPath = this.getBinaryPath('whisper')
    const ffmpegPath = this.getBinaryPath('ffmpeg')
    
    if (!(await this.checkFileExists(whisperPath))) {
      const errorMsg = `Critical: Whisper binary not found at ${whisperPath}`
      log.error(errorMsg)
      if (onProgress) {
        onProgress({ step: 'error', message: errorMsg, progress: 0 })
      }
      throw new Error(errorMsg)
    }

    if (!(await this.checkFileExists(ffmpegPath))) {
      const errorMsg = `Critical: FFmpeg binary not found at ${ffmpegPath}`
      log.error(errorMsg)
      if (onProgress) {
        onProgress({ step: 'error', message: errorMsg, progress: 0 })
      }
      throw new Error(errorMsg)
    }

    log.info('Binaries verified. Starting model download...')

    try {
      if (onProgress) {
        onProgress({ step: 'model', message: 'Starting download...', progress: 0 })
      }
      
      await this.downloadModel('base.en', onProgress)
      
      if (onProgress) {
        onProgress({
          step: 'model',
          message: 'Model ready',
          progress: 100
        })
      }
    } catch (error: any) {
      log.error('Model download failed:', error)
      const errorMsg = `Failed to download AI Model: ${error.message}`
      if (onProgress) {
        onProgress({ step: 'error', message: errorMsg, progress: 0 })
      }
      throw error
    }

    const modelPath = path.join(this.modelsPath, 'ggml-base.en.bin')
    if (!(await this.checkFileExists(modelPath))) {
      const errorMsg = 'Model download completed but file not found'
      log.error(errorMsg)
      throw new Error(errorMsg)
    }

    log.info('Setup completed successfully')
    
    if (onProgress) {
      onProgress({
        step: 'complete',
        message: 'Setup complete!',
        progress: 100
      })
    }
    
    return { success: true }
  }

  getInstallationInstructions(name: string): string {
    const platform = process.platform
    const arch = process.arch

    if (app.isPackaged) {
      return `Required binary '${name}' is missing from this installation. Please re-download OpenXol from the official website.`
    }

    if (name === 'whisper') {
      if (platform === 'darwin') {
        const archFlag = arch === 'arm64' ? '-DGGML_METAL=ON' : ''
        return `whisper.cpp binary missing (macOS ${arch}). Build from source:
1. git clone https://github.com/ggerganov/whisper.cpp
2. cd whisper.cpp && mkdir build && cd build
3. cmake ${archFlag} .. && make -j
4. cp build/bin/whisper-cli <project>/bin/darwin/whisper
5. chmod +x <project>/bin/darwin/whisper`
      } else if (platform === 'win32') {
        return `whisper.cpp binary missing (Windows). Download from:
https://github.com/ggerganov/whisper.cpp/releases
Place whisper.exe in: bin/win32/whisper.exe`
      } else {
        return `whisper.cpp binary missing (Linux ${arch}). Build from source:
1. git clone https://github.com/ggerganov/whisper.cpp
2. cd whisper.cpp && mkdir build && cd build && cmake .. && make -j
3. cp build/bin/whisper-cli <project>/bin/linux/whisper
4. chmod +x <project>/bin/linux/whisper`
      }
    } else if (name === 'ffmpeg') {
      if (platform === 'darwin') {
        return `ffmpeg binary missing (macOS ${arch}):
brew install ffmpeg && cp $(which ffmpeg) bin/darwin/ffmpeg && chmod +x bin/darwin/ffmpeg`
      } else if (platform === 'win32') {
        return `ffmpeg binary missing (Windows). Download from https://www.gyan.dev/ffmpeg/builds/
Place ffmpeg.exe in: bin/win32/ffmpeg.exe`
      } else {
        return `ffmpeg binary missing (Linux ${arch}):
sudo apt install ffmpeg   # or equivalent for your distro
cp $(which ffmpeg) bin/linux/ffmpeg && chmod +x bin/linux/ffmpeg`
      }
    }

    return `Binary '${name}' not found for ${platform}/${arch}. Place it in bin/${binaryPaths.PLATFORM_DIR}/.`
  }
}
