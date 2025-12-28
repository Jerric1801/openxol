const path = require('path');
const { app } = require('electron');

class ConfigManager {
  constructor() {
    this.store = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) {
      return;
    }

    // Dynamic import for ES Module
    const Store = (await import('electron-store')).default;
    
    // Get default output directory safely
    let defaultOutputDir = '';
    try {
      defaultOutputDir = path.join(app.getPath('documents'), 'Meeting Analysis');
    } catch (e) {
      // Fallback if app is not ready
      defaultOutputDir = path.join(require('os').homedir(), 'Meeting Analysis');
    }

    this.store = new Store({
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
    });

    this.initialized = true;
  }

  _ensureInitialized() {
    if (!this.initialized || !this.store) {
      throw new Error('ConfigManager not initialized. Call init() first.');
    }
  }

  getConfig() {
    this._ensureInitialized();
    return this.store.store;
  }

  saveConfig(config) {
    this._ensureInitialized();
    this.store.set(config);
    return true;
  }

  get(key) {
    this._ensureInitialized();
    return this.store.get(key);
  }

  set(key, value) {
    this._ensureInitialized();
    this.store.set(key, value);
  }
}

module.exports = ConfigManager;

