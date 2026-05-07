"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  // Config
  getConfig: () => electron.ipcRenderer.invoke("get-config"),
  saveConfig: (config) => electron.ipcRenderer.invoke("save-config", config),
  // File operations
  selectAudioFile: () => electron.ipcRenderer.invoke("select-audio-file"),
  selectOutputDirectory: () => electron.ipcRenderer.invoke("select-output-directory"),
  // Processing
  processAudio: (audioPath, config) => electron.ipcRenderer.invoke("process-audio", audioPath, config),
  cancelProcessing: () => electron.ipcRenderer.invoke("cancel-processing"),
  // App info
  getAppVersion: () => electron.ipcRenderer.invoke("get-app-version"),
  // Progress events (main → renderer)
  onProgress: (callback) => {
    electron.ipcRenderer.on("progress-update", callback);
  },
  onProcessingProgress: (callback) => {
    electron.ipcRenderer.on("processing-progress", callback);
  },
  // Setup
  checkSetupStatus: () => electron.ipcRenderer.invoke("check-setup-status"),
  performSetup: () => electron.ipcRenderer.invoke("perform-setup"),
  notifySetupFinished: () => {
    electron.ipcRenderer.send("setup-finished");
  },
  // Recording
  getDesktopSources: () => electron.ipcRenderer.invoke("get-desktop-sources"),
  startRecording: () => electron.ipcRenderer.invoke("recording-start"),
  sendRecordingChunk: (chunk) => electron.ipcRenderer.send("recording-chunk", chunk),
  stopRecording: () => electron.ipcRenderer.invoke("recording-stop"),
  cancelRecording: () => electron.ipcRenderer.send("recording-cancel"),
  removeAllListeners: (channel) => {
    electron.ipcRenderer.removeAllListeners(channel);
  }
});
