const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class FileUtils {
  static async getWorkingDirectory() {
    let baseTempDir;
    try {
      const { app } = require('electron');
      baseTempDir = app.getPath('temp');
    } catch (e) {
      // Fallback if app is not ready (e.g., during testing)
      baseTempDir = os.tmpdir();
    }
    
    const workingDir = path.join(baseTempDir, 'Meeting Analysis', 'temp');
    // Ensure directory exists
    await this.ensureDirectoryExists(workingDir);
    return workingDir;
  }

  static async ensureDirectoryExists(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  static async writeFile(filePath, content) {
    await this.ensureDirectoryExists(path.dirname(filePath));
    await fs.writeFile(filePath, content, 'utf-8');
  }

  static async readFile(filePath) {
    return await fs.readFile(filePath, 'utf-8');
  }

  static getFileExtension(filePath) {
    return path.extname(filePath).toLowerCase().slice(1);
  }

  static getFileNameWithoutExtension(filePath) {
    return path.basename(filePath, path.extname(filePath));
  }

  static async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  static async cleanupFile(filePath) {
    try {
      await fs.unlink(filePath);
      const log = require('electron-log');
      log.debug(`Cleaned up temp file: ${filePath}`);
    } catch (error) {
      // Log but don't throw - cleanup failures shouldn't break the pipeline
      const log = require('electron-log');
      log.warn(`Failed to cleanup temp file ${filePath}:`, error.message);
    }
  }
}

module.exports = FileUtils;




