const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Config management
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  
  // File operations
  selectAudioFile: () => ipcRenderer.invoke('select-audio-file'),
  selectOutputDirectory: () => ipcRenderer.invoke('select-output-directory'),
  
  // Processing
  processAudio: (audioPath, config) => ipcRenderer.invoke('process-audio', audioPath, config),
  cancelProcessing: () => ipcRenderer.invoke('cancel-processing'),
  
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // Progress updates (from main to renderer)
  onProgress: (callback) => {
    ipcRenderer.on('progress-update', (event, data) => callback(event, data));
  },
  
  // Processing progress updates
  onProcessingProgress: (callback) => {
    ipcRenderer.on('processing-progress', (event, data) => callback(event, data));
  },
  
  // Setup management
  checkSetupStatus: () => ipcRenderer.invoke('check-setup-status'),
  performSetup: () => ipcRenderer.invoke('perform-setup'),
  
  // Setup finished notification (to trigger app reload)
  notifySetupFinished: () => ipcRenderer.send('setup-finished'),
  
  // Remove listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

