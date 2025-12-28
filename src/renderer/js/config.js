class ConfigManager {
  constructor() {
    this.config = null;
  }

  async loadConfig() {
    try {
      this.config = await window.electronAPI.getConfig();
      this.applyConfigToUI();
    } catch (error) {
      console.error('Failed to load config:', error);
      this.config = this.getDefaultConfig();
    }
  }

  async saveConfig() {
    const config = this.getConfigFromUI();
    try {
      await window.electronAPI.saveConfig(config);
      this.config = config;
      this.showMessage('Configuration saved successfully', 'success');
    } catch (error) {
      console.error('Failed to save config:', error);
      this.showMessage('Failed to save configuration', 'error');
    }
  }

  getConfigFromUI() {
    return {
      transcription: {
        model: document.getElementById('transcriptionModel').value,
        language: '',
        useGpu: true
      },
      diarization: {
        enabled: document.getElementById('diarizationEnabled').checked,
        method: document.getElementById('diarizationMethod').value
      },
      analysis: {
        enabled: document.getElementById('analysisEnabled').checked,
        apiKey: document.getElementById('apiKey').value,
        model: document.getElementById('analysisModel').value
      },
      document: {
        enabled: true,
        includeToc: true,
        includeSpeakerAnalysis: true
      },
      output: {
        directory: document.getElementById('outputDirectory').value,
        useTimestampedDirs: document.getElementById('useTimestampedDirs').checked
      }
    };
  }

  applyConfigToUI() {
    if (!this.config) return;

    if (this.config.transcription) {
      document.getElementById('transcriptionModel').value = this.config.transcription.model || 'base.en';
    }

    if (this.config.diarization) {
      document.getElementById('diarizationEnabled').checked = this.config.diarization.enabled || false;
      document.getElementById('diarizationMethod').value = this.config.diarization.method || 'whisper-native';
    }

    if (this.config.analysis) {
      document.getElementById('analysisEnabled').checked = this.config.analysis.enabled !== false;
      document.getElementById('apiKey').value = this.config.analysis.apiKey || '';
      document.getElementById('analysisModel').value = this.config.analysis.model || 'gemini-2.5-flash-lite';
    }

    if (this.config.output) {
      document.getElementById('outputDirectory').value = this.config.output.directory || '';
      document.getElementById('useTimestampedDirs').checked = this.config.output.useTimestampedDirs !== false;
    }
  }

  getDefaultConfig() {
    return {
      transcription: { model: 'base.en', language: '', useGpu: true },
      diarization: { enabled: false, method: 'whisper-native' },
      analysis: { enabled: true, apiKey: '', model: 'gemini-2.5-flash-lite' },
      document: { enabled: true, includeToc: true, includeSpeakerAnalysis: true },
      output: { directory: '', useTimestampedDirs: true }
    };
  }

  getConfig() {
    return this.config || this.getConfigFromUI();
  }

  showMessage(message, type = 'info') {
    const statusBar = document.getElementById('statusBar');
    statusBar.textContent = message;
    statusBar.className = `status-bar ${type}`;
    setTimeout(() => {
      statusBar.className = 'status-bar';
      statusBar.textContent = 'Ready';
    }, 3000);
  }
}

const configManager = new ConfigManager();

// Initialize config on load
document.addEventListener('DOMContentLoaded', () => {
  configManager.loadConfig();
});

// Config toggle
document.getElementById('configToggle').addEventListener('click', () => {
  const panel = document.getElementById('configPanel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
});

// Save config button
document.getElementById('saveConfig').addEventListener('click', () => {
  configManager.saveConfig();
});

// Select output directory
document.getElementById('selectOutputDir').addEventListener('click', async () => {
  const path = await window.electronAPI.selectOutputDirectory();
  if (path) {
    document.getElementById('outputDirectory').value = path;
  }
});




