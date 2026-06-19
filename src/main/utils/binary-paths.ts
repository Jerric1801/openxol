import path from 'path'
import fs from 'fs'
import log from 'electron-log'
import { FileUtils } from './file-utils'

export const PLATFORM_DIR =
  process.platform === 'win32' ? 'win32' : process.platform === 'linux' ? 'linux' : 'darwin'

function isPackaged(): boolean {
  return process.env['APP_IS_PACKAGED'] === '1'
}

function appPath(): string {
  return process.env['APP_PATH'] || ''
}

function getBinaryDir(): string {
  if (isPackaged()) {
    const candidates = [
      path.join(process.resourcesPath, 'bin', PLATFORM_DIR),
      path.join(appPath(), '..', 'bin', PLATFORM_DIR),
      path.join(process.resourcesPath, '..', 'bin', PLATFORM_DIR)
    ]
    for (const dir of candidates) {
      if (fs.existsSync(dir)) {
        log.info(`Binary dir resolved: ${dir}`)
        return dir
      }
    }
    log.warn(`No binary dir found. Tried: ${candidates.join(', ')}`)
    return candidates[0] || ''
  }
  return path.join(appPath(), 'bin', PLATFORM_DIR)
}

export function getBinaryPath(name: string): string {
  const filename = process.platform === 'win32' ? `${name}.exe` : name
  
  // Check writable userData directory first (for auto-downloaded binaries)
  const userData = process.env['APP_USER_DATA'] || ''
  if (userData) {
    const userBinaryPath = path.join(userData, 'bin', PLATFORM_DIR, filename)
    if (fs.existsSync(userBinaryPath)) {
      return userBinaryPath
    }
  }

  return path.join(getBinaryDir(), filename)
}

export async function getModelPath(modelName = 'base.en'): Promise<string> {
  const userData = process.env['APP_USER_DATA'] || ''
  const userDataPath = path.join(userData, 'models', 'whisper', `ggml-${modelName}.bin`)

  if (await FileUtils.fileExists(userDataPath)) {
    log.info(`Model resolved from userData: ${userDataPath}`)
    return userDataPath
  }

  const bundledPath = isPackaged()
    ? path.join(process.resourcesPath, 'resources', 'models', 'whisper', `ggml-${modelName}.bin`)
    : path.join(__dirname, '../../resources/models/whisper', `ggml-${modelName}.bin`)

  if (await FileUtils.fileExists(bundledPath)) {
    log.info(`Model resolved from bundle: ${bundledPath}`)
    return bundledPath
  }

  log.warn(`Model not found in userData or bundle. Will download to: ${userDataPath}`)
  return userDataPath
}
