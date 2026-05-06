import path from 'path'
import os from 'os'
import { app } from 'electron'
import type { Config } from '../../types/config'

export class ConfigManager {
  private store: any = null
  private initialized = false

  async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    // Dynamic import for ES Module
    const Store = (await import('electron-store')).default
    
    // Get default output directory safely
    let defaultOutputDir = ''
    try {
      defaultOutputDir = path.join(app.getPath('documents'), 'Meeting Analysis')
    } catch (e) {
      // Fallback if app is not ready
      defaultOutputDir = path.join(os.homedir(), 'Meeting Analysis')
    }

    this.store = new Store<Config>({
      name: 'config',
      defaults: {
        transcription: {
          model: 'base.en',
          language: '',
          useGpu: true
        },
        diarization: {
          enabled: false,
          method: 'whisper-native'
        },
        analysis: {
          enabled: true,
          apiKey: '',
          model: 'gemini-2.5-flash-lite'
        },
        document: {
          enabled: true,
          includeToc: true,
          includeSpeakerAnalysis: true
        },
        output: {
          directory: defaultOutputDir,
          useTimestampedDirs: true
        }
      }
    })

    this.initialized = true
  }

  private _ensureInitialized(): void {
    if (!this.initialized || !this.store) {
      throw new Error('ConfigManager not initialized. Call init() first.')
    }
  }

  getConfig(): Config {
    this._ensureInitialized()
    return this.store.store as Config
  }

  saveConfig(config: Config): boolean {
    this._ensureInitialized()
    this.store.set(config)
    return true
  }

  get<K extends keyof Config>(key: K): Config[K] {
    this._ensureInitialized()
    return this.store.get(key)
  }

  set<K extends keyof Config>(key: K, value: Config[K]): void {
    this._ensureInitialized()
    this.store.set(key, value)
  }
}
