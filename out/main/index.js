"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
const electron = require("electron");
const path = require("path");
const log = require("electron-log");
const os = require("os");
const setupManager$1 = require("./chunks/setup-manager-Qv2tAgHY.js");
const fs = require("fs");
const child_process = require("child_process");
require("https");
require("fs/promises");
class ConfigManager {
  store = null;
  initialized = false;
  async init() {
    if (this.initialized) {
      return;
    }
    const Store = (await import("electron-store")).default;
    let defaultOutputDir = "";
    try {
      defaultOutputDir = path.join(electron.app.getPath("documents"), "Meeting Analysis");
    } catch (e) {
      defaultOutputDir = path.join(os.homedir(), "Meeting Analysis");
    }
    this.store = new Store({
      name: "config",
      defaults: {
        transcription: {
          model: "base.en",
          language: "",
          useGpu: true
        },
        diarization: {
          enabled: false,
          method: "whisper-native"
        },
        analysis: {
          enabled: true,
          apiKey: "",
          model: "gemini-2.5-flash-lite"
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
      throw new Error("ConfigManager not initialized. Call init() first.");
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
class RecordingManager {
  currentFilePath = null;
  writeStream = null;
  async getDesktopSources() {
    const sources = await electron.desktopCapturer.getSources({ types: ["window", "screen"] });
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL()
    }));
  }
  async startRecording(filePath) {
    try {
      await setupManager$1.FileUtils.ensureDirectoryExists(path.dirname(filePath));
      this.currentFilePath = filePath;
      this.writeStream = fs.createWriteStream(filePath);
      log.info(`Started recording to: ${filePath}`);
      return true;
    } catch (error) {
      log.error("Failed to start recording write stream:", error);
      return false;
    }
  }
  handleChunk(chunk) {
    if (this.writeStream) {
      this.writeStream.write(Buffer.from(chunk));
    }
  }
  async stopRecording() {
    if (!this.writeStream || !this.currentFilePath) {
      return null;
    }
    return new Promise((resolve) => {
      this.writeStream?.end(async () => {
        const webmPath = this.currentFilePath;
        this.writeStream = null;
        this.currentFilePath = null;
        log.info(`Recording stopped. Finalizing: ${webmPath}`);
        try {
          const wavPath = await this.convertToWav(webmPath);
          await setupManager$1.FileUtils.cleanupFile(webmPath);
          resolve(wavPath);
        } catch (error) {
          log.error("Failed to convert recording to WAV:", error);
          resolve(webmPath);
        }
      });
    });
  }
  cancelRecording() {
    if (this.writeStream) {
      this.writeStream.end();
      if (this.currentFilePath) {
        setupManager$1.FileUtils.cleanupFile(this.currentFilePath).catch(() => {
        });
      }
      this.writeStream = null;
      this.currentFilePath = null;
      log.info("Recording cancelled and cleaned up");
    }
  }
  async convertToWav(webmPath) {
    const ffmpegPath = setupManager$1.getBinaryPath("ffmpeg");
    const wavPath = webmPath.replace(".webm", ".wav");
    return new Promise((resolve, reject) => {
      const proc = child_process.spawn(ffmpegPath, [
        "-i",
        webmPath,
        "-ar",
        "16000",
        "-ac",
        "1",
        "-y",
        wavPath
      ]);
      proc.on("close", (code) => {
        if (code === 0) {
          resolve(wavPath);
        } else {
          reject(new Error(`FFmpeg exit code ${code}`));
        }
      });
      proc.on("error", (err) => reject(err));
    });
  }
}
let mainWindow = null;
let configManager;
let activeWorker = null;
const setupManager = new setupManager$1.SetupManager();
const recordingManager = new RecordingManager();
const DEV_SERVER_URL = process.env["ELECTRON_RENDERER_URL"];
function rendererFile(html) {
  return path.join(__dirname, "../renderer", html);
}
function loadPage(win, html) {
  if (DEV_SERVER_URL) {
    const base = DEV_SERVER_URL.replace(/\/$/, "");
    win.loadURL(html === "index.html" ? base : `${base}/${html}`);
  } else {
    win.loadFile(rendererFile(html));
  }
}
async function createWindow() {
  const status = await setupManager.checkSetupComplete();
  const isSetupComplete = status.complete;
  mainWindow = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  if (isSetupComplete) {
    log.info("Setup complete. Launching Main App...");
    loadPage(mainWindow, "index.html");
  } else {
    log.info("Setup incomplete. Launching Setup Wizard...");
    log.info(`Missing components: ${status.missing?.join(", ") ?? "unknown"}`);
    loadPage(mainWindow, "setup.html");
  }
  if (!electron.app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
}
electron.app.whenReady().then(async () => {
  process.env["APP_USER_DATA"] = electron.app.getPath("userData");
  process.env["APP_IS_PACKAGED"] = electron.app.isPackaged ? "1" : "0";
  process.env["APP_PATH"] = electron.app.getAppPath();
  configManager = new ConfigManager();
  await configManager.init();
  electron.ipcMain.removeHandler("perform-setup");
  electron.ipcMain.removeHandler("check-setup-status");
  electron.ipcMain.removeAllListeners("setup-finished");
  electron.ipcMain.handle("perform-setup", async () => {
    return await setupManager.performSetup((progressObj) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("progress-update", progressObj);
      }
    });
  });
  electron.ipcMain.handle("check-setup-status", async () => {
    return await setupManager.checkSetupComplete();
  });
  electron.ipcMain.on("setup-finished", async () => {
    log.info("Setup finished — reloading to main app...");
    const win = electron.BrowserWindow.getFocusedWindow();
    if (win) {
      const status = await setupManager.checkSetupComplete();
      if (status.complete) {
        loadPage(win, "index.html");
      } else {
        log.warn("setup-finished received but required files still missing");
      }
    }
  });
  await createWindow();
  electron.app.on("activate", async () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.ipcMain.handle("get-config", () => {
  return configManager.getConfig();
});
electron.ipcMain.handle("save-config", (_event, config) => {
  return configManager.saveConfig(config);
});
electron.ipcMain.handle("select-audio-file", async () => {
  if (!mainWindow) return null;
  const result = await electron.dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "Audio Files", extensions: ["mp3", "wav", "m4a", "aac", "flac", "ogg"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0] ?? null;
});
electron.ipcMain.handle("select-output-directory", async () => {
  if (!mainWindow) return null;
  const result = await electron.dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"]
  });
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0] ?? null;
});
electron.ipcMain.handle(
  "process-audio",
  async (_event, audioPath, config) => {
    return new Promise((resolve) => {
      const workerPath = path.join(__dirname, "worker.js");
      const child = electron.utilityProcess.fork(workerPath);
      activeWorker = child;
      child.postMessage({ type: "start", audioPath, config });
      child.on("message", (message) => {
        if (message.type === "progress") {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("processing-progress", message.data);
          }
        } else if (message.type === "result") {
          activeWorker = null;
          resolve({ success: true, result: message.data });
        } else if (message.type === "error") {
          log.error("Worker error:", message.data);
          activeWorker = null;
          resolve({ success: false, message: message.data.message });
        }
      });
      child.on("exit", (code) => {
        activeWorker = null;
        if (code !== 0) {
          log.warn(`Worker exited with code ${code}`);
          resolve({ success: false, message: `Worker exited with code ${code}` });
        }
      });
    });
  }
);
electron.ipcMain.handle("cancel-processing", () => {
  if (activeWorker) {
    log.info("Terminating active worker...");
    activeWorker.kill();
    activeWorker = null;
    return { success: true };
  }
  return { success: false, message: "No processing in progress" };
});
electron.ipcMain.handle("get-app-version", () => electron.app.getVersion());
electron.ipcMain.handle("get-desktop-sources", async () => {
  return await recordingManager.getDesktopSources();
});
electron.ipcMain.handle("recording-start", async () => {
  const userData = process.env["APP_USER_DATA"] || "";
  const recordingsDir = path.join(userData, "recordings");
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filePath = path.join(recordingsDir, `recording-${timestamp}.webm`);
  return await recordingManager.startRecording(filePath);
});
electron.ipcMain.on("recording-chunk", (_event, chunk) => {
  recordingManager.handleChunk(chunk);
});
electron.ipcMain.handle("recording-stop", async () => {
  return await recordingManager.stopRecording();
});
electron.ipcMain.on("recording-cancel", () => {
  recordingManager.cancelRecording();
});
