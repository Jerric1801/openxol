import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import log from 'electron-log'
import { FileUtils } from './file-utils'

export const PLATFORM_DIR =
  process.platform === 'win32' ? 'win32' : process.platform === 'linux' ? 'linux' : 'darwin'

function getBinaryDir(): string {
  if (app.isPackaged) {
    const candidates = [
      path.join(process.resourcesPath, 'bin', PLATFORM_DIR),
      path.join(app.getAppPath(), '..', 'bin', PLATFORM_DIR),
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
  // Dev: out/main/ (post-bundle __dirname) → ../../ = project root
  return path.join(__dirname, '../../bin', PLATFORM_DIR)
}

export function getBinaryPath(name: string): string {
  const filename = process.platform === 'win32' ? `${name}.exe` : name
  return path.join(getBinaryDir(), filename)
}

export async function getModelPath(modelName = 'base.en'): Promise<string> {
  const userDataPath = path.join(
    app.getPath('userData'),
    'models',
    'whisper',
    `ggml-${modelName}.bin`
  )

  if (await FileUtils.fileExists(userDataPath)) {
    log.info(`Model resolved from userData: ${userDataPath}`)
    return userDataPath
  }

  const bundledPath = app.isPackaged
    ? path.join(process.resourcesPath, 'resources', 'models', 'whisper', `ggml-${modelName}.bin`)
    : path.join(__dirname, '../../resources/models/whisper', `ggml-${modelName}.bin`)

  if (await FileUtils.fileExists(bundledPath)) {
    log.info(`Model resolved from bundle: ${bundledPath}`)
    return bundledPath
  }

  log.warn(`Model not found in userData or bundle. Will download to: ${userDataPath}`)
  return userDataPath
}
