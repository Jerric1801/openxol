import { desktopCapturer, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import log from 'electron-log'
import { spawn } from 'child_process'
import { FileUtils } from './file-utils'
import * as binaryPaths from './binary-paths'

export class RecordingManager {
  private currentFilePath: string | null = null
  private writeStream: fs.WriteStream | null = null

  async getDesktopSources(): Promise<any[]> {
    const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] })
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL()
    }))
  }

  async startRecording(filePath: string): Promise<boolean> {
    try {
      await FileUtils.ensureDirectoryExists(path.dirname(filePath))
      this.currentFilePath = filePath
      this.writeStream = fs.createWriteStream(filePath)
      log.info(`Started recording to: ${filePath}`)
      return true
    } catch (error) {
      log.error('Failed to start recording write stream:', error)
      return false
    }
  }

  handleChunk(chunk: ArrayBuffer): void {
    if (this.writeStream) {
      this.writeStream.write(Buffer.from(chunk))
    }
  }

  async stopRecording(): Promise<string | null> {
    if (!this.writeStream || !this.currentFilePath) {
      return null
    }

    return new Promise((resolve) => {
      this.writeStream?.end(async () => {
        const webmPath = this.currentFilePath!
        this.writeStream = null
        this.currentFilePath = null

        log.info(`Recording stopped. Finalizing: ${webmPath}`)

        // Convert .webm to .wav via ffmpeg
        try {
          const wavPath = await this.convertToWav(webmPath)
          // Clean up webm
          await FileUtils.cleanupFile(webmPath)
          resolve(wavPath)
        } catch (error) {
          log.error('Failed to convert recording to WAV:', error)
          resolve(webmPath) // Fallback to webm if conversion fails
        }
      })
    })
  }

  cancelRecording(): void {
    if (this.writeStream) {
      this.writeStream.end()
      if (this.currentFilePath) {
        FileUtils.cleanupFile(this.currentFilePath).catch(() => {})
      }
      this.writeStream = null
      this.currentFilePath = null
      log.info('Recording cancelled and cleaned up')
    }
  }

  private async convertToWav(webmPath: string): Promise<string> {
    const ffmpegPath = binaryPaths.getBinaryPath('ffmpeg')
    const wavPath = webmPath.replace('.webm', '.wav')

    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, [
        '-i', webmPath,
        '-ar', '16000',
        '-ac', '1',
        '-y',
        wavPath
      ])

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(wavPath)
        } else {
          reject(new Error(`FFmpeg exit code ${code}`))
        }
      })

      proc.on('error', (err) => reject(err))
    })
  }
}
