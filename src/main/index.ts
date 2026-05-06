import { app, BrowserWindow, ipcMain, dialog, utilityProcess } from 'electron'
import path from 'path'
import log from 'electron-log'
import { ConfigManager } from './utils/config-manager'
import { SetupManager } from './utils/setup-manager'
import { RecordingManager } from './utils/recording-manager'
import type { Config } from '../types/config'

let mainWindow: BrowserWindow | null = null
let configManager: ConfigManager
let activeWorker: any = null

const setupManager = new SetupManager()
const recordingManager = new RecordingManager()


const DEV_SERVER_URL = process.env['ELECTRON_RENDERER_URL']

// out/main/ → ../renderer/ resolves to project root /out/renderer/ in both dev and packaged ASAR
function rendererFile(html: string): string {
  return path.join(__dirname, '../renderer', html)
}

function loadPage(win: BrowserWindow, html: string): void {
  if (DEV_SERVER_URL) {
    const base = DEV_SERVER_URL.replace(/\/$/, '')
    win.loadURL(html === 'index.html' ? base : `${base}/${html}`)
  } else {
    win.loadFile(rendererFile(html))
  }
}

async function createWindow(): Promise<void> {
  const status = await setupManager.checkSetupComplete()
  const isSetupComplete: boolean = status.complete

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  if (isSetupComplete) {
    log.info('Setup complete. Launching Main App...')
    loadPage(mainWindow, 'index.html')
  } else {
    log.info('Setup incomplete. Launching Setup Wizard...')
    log.info(`Missing components: ${status.missing?.join(', ') ?? 'unknown'}`)
    loadPage(mainWindow, 'setup.html')
  }

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools()
  }
}

app.whenReady().then(async () => {
  configManager = new ConfigManager()
  await configManager.init()

  // Clear stale handlers (prevents duplicate registration on window reload)
  ipcMain.removeHandler('perform-setup')
  ipcMain.removeHandler('check-setup-status')
  ipcMain.removeAllListeners('setup-finished')

  ipcMain.handle('perform-setup', async () => {
    return await setupManager.performSetup((progressObj: unknown) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('progress-update', progressObj)
      }
    })
  })

  ipcMain.handle('check-setup-status', async () => {
    return await setupManager.checkSetupComplete()
  })

  ipcMain.on('setup-finished', async () => {
    log.info('Setup finished — reloading to main app...')
    const win = BrowserWindow.getFocusedWindow()
    if (win) {
      const status = await setupManager.checkSetupComplete()
      if (status.complete) {
        loadPage(win, 'index.html')
      } else {
        log.warn('setup-finished received but required files still missing')
      }
    }
  })

  await createWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('get-config', () => {
  return configManager.getConfig()
})

ipcMain.handle('save-config', (_event: Electron.IpcMainInvokeEvent, config: Config) => {
  return configManager.saveConfig(config)
})

ipcMain.handle('select-audio-file', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  return result.canceled || result.filePaths.length === 0 ? null : (result.filePaths[0] ?? null)
})

ipcMain.handle('select-output-directory', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  })
  return result.canceled || result.filePaths.length === 0
    ? null
    : (result.filePaths[0] ?? null)
})

ipcMain.handle(
  'process-audio',
  async (_event: Electron.IpcMainInvokeEvent, audioPath: string, config: Config) => {
    return new Promise((resolve) => {
      const workerPath = path.join(__dirname, 'worker.js')
      const child = utilityProcess.fork(workerPath)
      activeWorker = child

      child.postMessage({ type: 'start', audioPath, config })

      child.on('message', (message: any) => {
        if (message.type === 'progress') {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('processing-progress', message.data)
          }
        } else if (message.type === 'result') {
          activeWorker = null
          resolve({ success: true, result: message.data })
        } else if (message.type === 'error') {
          log.error('Worker error:', message.data)
          activeWorker = null
          resolve({ success: false, message: message.data.message })
        }
      })

      child.on('exit', (code) => {
        activeWorker = null
        if (code !== 0) {
          log.warn(`Worker exited with code ${code}`)
          resolve({ success: false, message: `Worker exited with code ${code}` })
        }
      })
    })
  }
)

ipcMain.handle('cancel-processing', () => {
  if (activeWorker) {
    log.info('Terminating active worker...')
    activeWorker.kill()
    activeWorker = null
    return { success: true }
  }
  return { success: false, message: 'No processing in progress' }
})

ipcMain.handle('get-app-version', () => app.getVersion())

// Recording IPC Handlers
ipcMain.handle('get-desktop-sources', async () => {
  return await recordingManager.getDesktopSources()
})

ipcMain.handle('recording-start', async (_event, filePath: string) => {
  return await recordingManager.startRecording(filePath)
})

ipcMain.on('recording-chunk', (_event, chunk: ArrayBuffer) => {
  recordingManager.handleChunk(chunk)
})

ipcMain.handle('recording-stop', async () => {
  return await recordingManager.stopRecording()
})

ipcMain.on('recording-cancel', () => {
  recordingManager.cancelRecording()
})

