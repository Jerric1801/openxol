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
        model: (document.getElementById('transcriptionModel') as HTMLSelectElement).value,
        language: '',
        useGpu: true
      },
      diarization: {
        enabled: (document.getElementById('diarizationEnabled') as HTMLInputElement).checked,
        method: (document.getElementById('diarizationMethod') as HTMLSelectElement).value as any
      },
      analysis: {
        enabled: (document.getElementById('analysisEnabled') as HTMLInputElement).checked,
        apiKey: (document.getElementById('apiKey') as HTMLInputElement).value,
        model: (document.getElementById('analysisModel') as HTMLSelectElement).value
      },
      document: {
        enabled: true,
        includeToc: true,
        includeSpeakerAnalysis: true
      },
      output: {
        directory: (document.getElementById('outputDirectory') as HTMLInputElement).value,
        useTimestampedDirs: (document.getElementById('useTimestampedDirs') as HTMLInputElement).checked
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
      ;(document.getElementById('diarizationEnabled') as HTMLInputElement).checked =
        this.config.diarization.enabled || false
      ;(document.getElementById('diarizationMethod') as HTMLSelectElement).value =
        this.config.diarization.method || 'whisper-native'
    }

    if (this.config.analysis) {
      ;(document.getElementById('analysisEnabled') as HTMLInputElement).checked =
        this.config.analysis.enabled !== false
      ;(document.getElementById('apiKey') as HTMLInputElement).value = this.config.analysis.apiKey || ''
      ;(document.getElementById('analysisModel') as HTMLSelectElement).value =
        this.config.analysis.model || 'gemini-2.0-flash-exp'
    }

    if (this.config.output) {
      ;(document.getElementById('outputDirectory') as HTMLInputElement).value =
        this.config.output.directory || ''
      ;(document.getElementById('useTimestampedDirs') as HTMLInputElement).checked =
        this.config.output.useTimestampedDirs !== false
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
  document.addEventListener('DOMContentLoaded', () => {
    configManager.loadConfig()
  })

  document.getElementById('configToggle')?.addEventListener('click', () => {
    const panel = document.getElementById('configPanel')
    if (panel) {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none'
    }
  })

  document.getElementById('saveConfig')?.addEventListener('click', () => {
    configManager.saveConfig()
  })

  document.getElementById('selectOutputDir')?.addEventListener('click', async () => {
    const path = await (window as any).electronAPI.selectOutputDirectory()
    if (path) {
      ;(document.getElementById('outputDirectory') as HTMLInputElement).value = path
    }
  })
}
