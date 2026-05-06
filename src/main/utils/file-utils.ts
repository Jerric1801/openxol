import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { app } from 'electron'
import log from 'electron-log'

export class FileUtils {
  static async getWorkingDirectory(): Promise<string> {
    let baseTempDir: string
    try {
      baseTempDir = app.getPath('temp')
    } catch (e) {
      // Fallback if app is not ready (e.g., during testing)
      baseTempDir = os.tmpdir()
    }
    
    const workingDir = path.join(baseTempDir, 'Meeting Analysis', 'temp')
    // Ensure directory exists
    await this.ensureDirectoryExists(workingDir)
    return workingDir
  }

  static async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true })
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw error
      }
    }
  }

  static async writeFile(filePath: string, content: string | Uint8Array): Promise<void> {
    await this.ensureDirectoryExists(path.dirname(filePath))
    await fs.writeFile(filePath, content, 'utf-8')
  }

  static async readFile(filePath: string): Promise<string> {
    return await fs.readFile(filePath, 'utf-8')
  }

  static getFileExtension(filePath: string): string {
    return path.extname(filePath).toLowerCase().slice(1)
  }

  static getFileNameWithoutExtension(filePath: string): string {
    return path.basename(filePath, path.extname(filePath))
  }

  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  static async cleanupFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath)
      log.debug(`Cleaned up temp file: ${filePath}`)
    } catch (error: any) {
      // Log but don't throw - cleanup failures shouldn't break the pipeline
      log.warn(`Failed to cleanup temp file ${filePath}:`, error.message)
    }
  }
}
