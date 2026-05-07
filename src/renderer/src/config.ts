import type { Config } from '../../types/config'

export const DEFAULT_SYSTEM_PROMPT = `You are an expert executive assistant and meeting scribe. Analyze the provided meeting transcript to produce a structured, concise summary. Focus on:
- Executive Summary: A 3-4 sentence overview of the meeting's purpose and outcome.
- Key Decisions: A bulleted list of all major decisions made.
- Action Items Table: A markdown table with three columns: 'Action Item', 'Owner', and 'Deadline'. If a deadline is not explicitly mentioned, put 'TBD'.
- Key Themes: Brief notes on main discussion points.
Be concise, remove fluff, and ensure accountability is clear.`

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
          'gemini-2.5-flash-lite',
        systemPrompt: this.config?.analysis?.systemPrompt || DEFAULT_SYSTEM_PROMPT
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
      analysis: { enabled: true, apiKey: '', model: 'gemini-2.5-flash-lite', systemPrompt: DEFAULT_SYSTEM_PROMPT },
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

  // System prompt modal
  const promptModal = document.getElementById('promptModal')
  const promptTextarea = document.getElementById('systemPromptInput') as HTMLTextAreaElement | null

  document.getElementById('editPromptBtn')?.addEventListener('click', () => {
    if (promptModal && promptTextarea) {
      promptTextarea.value = configManager.getConfig().analysis?.systemPrompt || DEFAULT_SYSTEM_PROMPT
      promptModal.style.display = 'flex'
    }
  })

  const closeModal = () => {
    if (promptModal) promptModal.style.display = 'none'
  }

  document.getElementById('promptModalClose')?.addEventListener('click', closeModal)

  promptModal?.addEventListener('click', (e) => {
    if (e.target === promptModal) closeModal()
  })

  document.getElementById('promptModalReset')?.addEventListener('click', () => {
    if (promptTextarea) promptTextarea.value = DEFAULT_SYSTEM_PROMPT
  })

  document.getElementById('promptModalSave')?.addEventListener('click', async () => {
    if (promptTextarea && configManager.getConfig()) {
      // Update in-memory config and persist
      const updated = configManager.getConfig()
      updated.analysis.systemPrompt = promptTextarea.value.trim() || DEFAULT_SYSTEM_PROMPT
      await (window as any).electronAPI.saveConfig(updated)
      ;(configManager as any).config = updated
    }
    closeModal()
  })
}
