import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Config
  getConfig: (): Promise<unknown> =>
    ipcRenderer.invoke('get-config'),
  saveConfig: (config: unknown): Promise<boolean> =>
    ipcRenderer.invoke('save-config', config),

  // File operations
  selectAudioFile: (): Promise<string | null> =>
    ipcRenderer.invoke('select-audio-file'),
  selectOutputDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('select-output-directory'),

  // Processing
  processAudio: (audioPath: string, config: unknown): Promise<unknown> =>
    ipcRenderer.invoke('process-audio', audioPath, config),
  cancelProcessing: (): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('cancel-processing'),

  // App info
  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke('get-app-version'),

  // Progress events (main → renderer)
  onProgress: (callback: (event: Electron.IpcRendererEvent, data: unknown) => void): void => {
    ipcRenderer.on('progress-update', callback)
  },
  onProcessingProgress: (
    callback: (event: Electron.IpcRendererEvent, data: unknown) => void
  ): void => {
    ipcRenderer.on('processing-progress', callback)
  },

  // Setup
  checkSetupStatus: (): Promise<unknown> =>
    ipcRenderer.invoke('check-setup-status'),
  performSetup: (): Promise<unknown> =>
    ipcRenderer.invoke('perform-setup'),
  notifySetupFinished: (): void => {
    ipcRenderer.send('setup-finished')
  },

  // Recording
  getDesktopSources: (): Promise<any[]> =>
    ipcRenderer.invoke('get-desktop-sources'),
  startRecording: (): Promise<boolean> =>
    ipcRenderer.invoke('recording-start'),
  sendRecordingChunk: (chunk: ArrayBuffer): void =>
    ipcRenderer.send('recording-chunk', chunk),
  stopRecording: (): Promise<string | null> =>
    ipcRenderer.invoke('recording-stop'),
  cancelRecording: (): void =>
    ipcRenderer.send('recording-cancel'),

  removeAllListeners: (channel: string): void => {
    ipcRenderer.removeAllListeners(channel)
  }
})
