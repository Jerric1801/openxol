import https from 'https'
import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
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
  private get modelsPath(): string {
    const userData = process.env['APP_USER_DATA'] || ''
    return path.join(userData, 'models', 'whisper')
  }

  constructor() {}

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

    // Migration fallback for previously downloaded model in relative directory
    const relativePath = path.join(process.cwd(), 'models', 'whisper', fileName)
    if (await this.checkFileExists(relativePath)) {
      log.info(`Migrating previously downloaded model from relative path ${relativePath} to ${destPath}`)
      await ensureDir(this.modelsPath)
      await fsPromises.copyFile(relativePath, destPath)
      await fsPromises.unlink(relativePath).catch(() => {})
      return destPath
    }

    await ensureDir(this.modelsPath)
    return this.downloadUrl(url, destPath, 'model', 'Downloading Model', onProgress)
  }

  private getBinaryDownloadUrl(name: string): string {
    const platform = process.platform
    if (name === 'whisper') {
      if (platform === 'win32') {
        return 'https://github.com/ggerganov/whisper.cpp/releases/download/v1.5.4/whisper-bin-x64.zip'
      }
    } else if (name === 'ffmpeg') {
      if (platform === 'win32') {
        return 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
      } else if (platform === 'darwin') {
        return 'https://evermeet.cx/ffmpeg/ffmpeg-11.4.1.zip'
      }
    }
    return ''
  }

  private async downloadUrl(
    url: string,
    destPath: string,
    step: string,
    messagePrefix: string,
    onProgress?: (progress: any) => void
  ): Promise<string> {
    await ensureDir(path.dirname(destPath))

    return new Promise((resolve, reject) => {
      const download = (downloadUrl: string): void => {
        https
          .get(downloadUrl, (response) => {
            const isRedirect = response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location;
            if (isRedirect) {
              let redirectUrl = response.headers.location!;
              if (!redirectUrl.startsWith('http')) {
                const parentUrl = new URL(downloadUrl);
                redirectUrl = new URL(redirectUrl, parentUrl).toString();
              }
              log.info(`Redirecting (HTTP ${response.statusCode}) to: ${redirectUrl}`)
              return download(redirectUrl)
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
                const percent = (downloaded / totalSize) * 100
                onProgress({
                  step,
                  progress: percent,
                  message: `${messagePrefix}... ${Math.round(percent)}%`
                })
              }
            })

            response.on('end', () => {
              fileStream.end()
              fileStream.on('finish', () => {
                log.info(`Downloaded successfully to ${destPath}`)
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

      log.info(`Starting download from ${url} to ${destPath}`)
      download(url)
    })
  }

  private async extractZip(zipPath: string, destDir: string): Promise<void> {
    await ensureDir(destDir)
    const platform = process.platform

    // Prepare commands to try in order of preference
    const commands: { name: string; cmd: string }[] = []

    // 1. 'tar' is standard on macOS, Linux, and Windows 10/11 (since Build 17063)
    commands.push({
      name: 'tar',
      cmd: `tar -xf "${zipPath}" -C "${destDir}"`
    })

    if (platform === 'win32') {
      // 2. PowerShell Expand-Archive fallback for older/restricted Windows systems
      commands.push({
        name: 'PowerShell Expand-Archive',
        cmd: `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force"`
      })
    } else {
      // 2. unzip fallback on macOS and Linux
      commands.push({
        name: 'unzip',
        cmd: `unzip -o "${zipPath}" -d "${destDir}"`
      })
    }

    const errors: string[] = []

    for (const item of commands) {
      log.info(`Attempting extraction using ${item.name}...`)
      try {
        await new Promise<void>((resolve, reject) => {
          exec(item.cmd, (error, stdout, stderr) => {
            if (error) {
              const errMsg = stderr?.trim() || error.message
              log.warn(`${item.name} extraction failed: ${errMsg}`)
              reject(new Error(errMsg))
            } else {
              log.info(`${item.name} extraction succeeded`)
              resolve()
            }
          })
        })
        return // Extraction succeeded, exit the loop and method
      } catch (err: any) {
        errors.push(`${item.name}: ${err.message}`)
      }
    }

    // If all extraction methods failed, throw a detailed error
    const errorDetails = errors.map((e, idx) => `  ${idx + 1}. ${e}`).join('\n')
    const manualInstructions = this.getInstallationInstructions(zipPath.includes('ffmpeg') ? 'ffmpeg' : 'whisper')
    
    throw new Error(
      `Failed to extract package on OS '${platform}'. None of the native extraction utilities were successful.\n\n` +
      `Attempted methods:\n${errorDetails}\n\n` +
      `Please ensure that either 'tar' or a platform-supported utility (unzip on Unix / powershell on Windows) is installed and available in your environment system PATH, or manually place the files:\n\n${manualInstructions}`
    )
  }

  private async findFileRecursive(dir: string, fileName: string): Promise<string | null> {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        const found = await this.findFileRecursive(fullPath, fileName)
        if (found) return found
      } else if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
        return fullPath
      }
    }
    return null
  }

  async installWhisper(onProgress?: (progress: any) => void): Promise<void> {
    const platform = process.platform
    const url = this.getBinaryDownloadUrl('whisper')
    
    if (!url) {
      const instructions = this.getInstallationInstructions('whisper')
      throw new Error(`Auto-download not supported for Whisper on ${platform}. Please follow manual instructions:\n\n${instructions}`)
    }

    const userData = process.env['APP_USER_DATA'] || ''
    const tempDir = path.join(userData, 'temp_setup')
    const zipPath = path.join(tempDir, 'whisper.zip')
    const extractDir = path.join(tempDir, 'whisper_extracted')

    try {
      await ensureDir(tempDir)
      await ensureDir(extractDir)

      if (onProgress) {
        onProgress({ step: 'whisper', message: 'Downloading Whisper...', progress: 0 })
      }

      await this.downloadUrl(url, zipPath, 'whisper', 'Downloading Whisper', onProgress)

      if (onProgress) {
        onProgress({ step: 'whisper', message: 'Extracting Whisper...', progress: 90 })
      }

      await this.extractZip(zipPath, extractDir)

      // Find and copy binaries
      const targetDir = path.join(userData, 'bin', binaryPaths.PLATFORM_DIR)
      await ensureDir(targetDir)

      // Search for whisper executable
      let execPath = await this.findFileRecursive(extractDir, 'whisper.exe')
      if (!execPath) execPath = await this.findFileRecursive(extractDir, 'main.exe')
      if (!execPath) execPath = await this.findFileRecursive(extractDir, 'whisper-cli.exe')

      if (!execPath) {
        throw new Error('Could not find whisper executable (whisper.exe or main.exe) in extracted files')
      }

      await fsPromises.copyFile(execPath, path.join(targetDir, platform === 'win32' ? 'whisper.exe' : 'whisper'))
      
      // For Windows, also copy dependency DLLs
      if (platform === 'win32') {
        const whisperDll = await this.findFileRecursive(extractDir, 'whisper.dll')
        if (whisperDll) {
          await fsPromises.copyFile(whisperDll, path.join(targetDir, 'whisper.dll'))
        }
        const sdlDll = await this.findFileRecursive(extractDir, 'SDL2.dll')
        if (sdlDll) {
          await fsPromises.copyFile(sdlDll, path.join(targetDir, 'SDL2.dll'))
        }
      }

      log.info('Whisper binary installed successfully')
    } finally {
      // Clean up temp directory
      await fsPromises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  async installFFmpeg(onProgress?: (progress: any) => void): Promise<void> {
    const platform = process.platform
    const url = this.getBinaryDownloadUrl('ffmpeg')
    
    if (!url) {
      const instructions = this.getInstallationInstructions('ffmpeg')
      throw new Error(`Auto-download not supported for FFmpeg on ${platform}. Please follow manual instructions:\n\n${instructions}`)
    }

    const userData = process.env['APP_USER_DATA'] || ''
    const tempDir = path.join(userData, 'temp_setup_ffmpeg')
    const zipPath = path.join(tempDir, 'ffmpeg.zip')
    const extractDir = path.join(tempDir, 'ffmpeg_extracted')

    try {
      await ensureDir(tempDir)
      await ensureDir(extractDir)

      if (onProgress) {
        onProgress({ step: 'ffmpeg', message: 'Downloading FFmpeg...', progress: 0 })
      }

      await this.downloadUrl(url, zipPath, 'ffmpeg', 'Downloading FFmpeg', onProgress)

      if (onProgress) {
        onProgress({ step: 'ffmpeg', message: 'Extracting FFmpeg...', progress: 90 })
      }

      await this.extractZip(zipPath, extractDir)

      // Find and copy binary
      const targetDir = path.join(userData, 'bin', binaryPaths.PLATFORM_DIR)
      await ensureDir(targetDir)

      const fileName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
      const execPath = await this.findFileRecursive(extractDir, fileName)

      if (!execPath) {
        throw new Error(`Could not find ${fileName} in extracted files`)
      }

      const destBinPath = path.join(targetDir, fileName)
      await fsPromises.copyFile(execPath, destBinPath)
      
      if (platform !== 'win32') {
        await fsPromises.chmod(destBinPath, 0o755) // Ensure executable permission
      }

      log.info('FFmpeg binary installed successfully')
    } finally {
      // Clean up temp directory
      await fsPromises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  async performSetup(onProgress?: (progress: any) => void): Promise<{ success: boolean }> {
    const whisperPath = this.getBinaryPath('whisper')
    const ffmpegPath = this.getBinaryPath('ffmpeg')
    
    // 1. Install Whisper if missing
    if (!(await this.checkFileExists(whisperPath))) {
      log.info('Whisper binary missing. Starting auto-install...')
      try {
        await this.installWhisper(onProgress)
      } catch (error: any) {
        log.error('Whisper auto-install failed:', error)
        const errorMsg = `Failed to install Whisper: ${error.message}`
        if (onProgress) {
          onProgress({ step: 'error', message: errorMsg, progress: 0 })
        }
        throw error
      }
    } else {
      log.info('Whisper binary verified.')
      if (onProgress) {
        onProgress({ step: 'whisper', message: 'Whisper ready', progress: 100 })
      }
    }

    // 2. Install FFmpeg if missing
    if (!(await this.checkFileExists(ffmpegPath))) {
      log.info('FFmpeg binary missing. Starting auto-install...')
      try {
        await this.installFFmpeg(onProgress)
      } catch (error: any) {
        log.error('FFmpeg auto-install failed:', error)
        const errorMsg = `Failed to install FFmpeg: ${error.message}`
        if (onProgress) {
          onProgress({ step: 'error', message: errorMsg, progress: 0 })
        }
        throw error
      }
    } else {
      log.info('FFmpeg binary verified.')
      if (onProgress) {
        onProgress({ step: 'ffmpeg', message: 'FFmpeg ready', progress: 100 })
      }
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

    if (process.env['APP_IS_PACKAGED'] === '1') {
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
