import type { Config } from '../../types/config'

export class ConfigManager {
  private config: Config | null = null

  async loadConfig(): Promise<void> {
    try {
      this.config = (await (window as any).electronAPI.getConfig()) as Config
      this.applyConfigToUI()
    } catch (error) {
      console.error('Failed to load config:', error)
      this.config = this.getDefaultConfig()
    }
  }

  async saveConfig(): Promise<void> {
    const config = this.getConfigFromUI()
    try {
      await (window as any).electronAPI.saveConfig(config)
      this.config = config
      this.showMessage('Configuration saved successfully', 'success')
    } catch (error) {
      console.error('Failed to save config:', error)
      this.showMessage('Failed to save configuration', 'error')
    }
  }

  getConfigFromUI(): Config {
    return {
      transcription: {
        model:
          (document.getElementById('transcriptionModel') as HTMLSelectElement | null)?.value ||
          'base.en',
        language: '',
        useGpu: true
      },
      diarization: {
        enabled:
          (document.getElementById('diarizationEnabled') as HTMLInputElement | null)?.checked ||
          false,
        method:
          ((document.getElementById('diarizationMethod') as HTMLSelectElement | null)?.value ||
            'whisper-native') as any
      },
      analysis: {
        enabled:
          (document.getElementById('analysisEnabled') as HTMLInputElement | null)?.checked !== false,
        apiKey:
          (document.getElementById('apiKey') as HTMLInputElement | null)?.value || '',
        model:
          (document.getElementById('analysisModel') as HTMLSelectElement | null)?.value ||
          'gemini-2.5-flash-lite'
      },
      document: {
        enabled: true,
        includeToc: true,
        includeSpeakerAnalysis: true
      },
      output: {
        directory:
          (document.getElementById('outputDirectory') as HTMLInputElement | null)?.value || '',
        useTimestampedDirs:
          (document.getElementById('useTimestampedDirs') as HTMLInputElement | null)?.checked !==
          false
      }
    }
  }

  applyConfigToUI(): void {
    if (!this.config) return

    if (this.config.transcription) {
      ;(document.getElementById('transcriptionModel') as HTMLSelectElement).value =
        this.config.transcription.model || 'base.en'
    }

    if (this.config.diarization) {
      const diarizationEnabled = document.getElementById('diarizationEnabled') as HTMLInputElement | null
      if (diarizationEnabled) diarizationEnabled.checked = this.config.diarization.enabled || false
      const diarizationMethod = document.getElementById('diarizationMethod') as HTMLSelectElement | null
      if (diarizationMethod) diarizationMethod.value = this.config.diarization.method || 'whisper-native'
      const methodGroup = document.getElementById('diarizationMethodGroup')
      if (methodGroup) methodGroup.style.display = this.config.diarization.enabled ? 'flex' : 'none'
    }

    if (this.config.analysis) {
      ;(document.getElementById('analysisEnabled') as HTMLInputElement).checked =
        this.config.analysis.enabled !== false
      ;(document.getElementById('apiKey') as HTMLInputElement).value = this.config.analysis.apiKey || ''
      ;(document.getElementById('analysisModel') as HTMLSelectElement).value =
        this.config.analysis.model || 'gemini-2.0-flash-exp'
    }

    if (this.config.output) {
      const outputDirectory = document.getElementById('outputDirectory') as HTMLInputElement | null
      if (outputDirectory) outputDirectory.value = this.config.output.directory || ''
      const useTimestampedDirs = document.getElementById('useTimestampedDirs') as HTMLInputElement | null
      if (useTimestampedDirs) useTimestampedDirs.checked = this.config.output.useTimestampedDirs !== false
    }
  }

  getDefaultConfig(): Config {
    return {
      transcription: { model: 'base.en', language: '', useGpu: true },
      diarization: { enabled: false, method: 'whisper-native' },
      analysis: { enabled: true, apiKey: '', model: 'gemini-2.0-flash-exp' },
      document: { enabled: true, includeToc: true, includeSpeakerAnalysis: true },
      output: { directory: '', useTimestampedDirs: true }
    }
  }

  getConfig(): Config {
    return this.config || this.getConfigFromUI()
  }

  showMessage(message: string, type = 'info'): void {
    const statusBar = document.getElementById('statusBar')
    if (statusBar) {
      statusBar.textContent = message
      statusBar.className = `status-bar ${type}`
      setTimeout(() => {
        statusBar.className = 'status-bar'
        statusBar.textContent = 'Ready'
      }, 3000)
    }
  }
}

export const configManager = new ConfigManager()

// Initialize listeners
export function initConfigUI(): void {
  configManager.loadConfig()

  document.getElementById('diarizationEnabled')?.addEventListener('change', (e) => {
    const enabled = (e.target as HTMLInputElement).checked
    const methodGroup = document.getElementById('diarizationMethodGroup')
    if (methodGroup) methodGroup.style.display = enabled ? 'flex' : 'none'
  })

  document.getElementById('saveConfig')?.addEventListener('click', () => {
    configManager.saveConfig()
  })

  document.getElementById('selectOutputDir')?.addEventListener('click', async () => {
    const path = await (window as any).electronAPI.selectOutputDirectory()
    if (path) {
      const outputDirectory = document.getElementById('outputDirectory') as HTMLInputElement | null
      if (outputDirectory) outputDirectory.value = path
    }
  })

  document.getElementById('toggleSettings')?.addEventListener('click', () => {
    document.querySelector('.app-body')?.classList.toggle('settings-collapsed')
  })
}
