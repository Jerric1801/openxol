import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import log from 'electron-log'

// JS pipeline/utils — typed as any until Phase 2 TypeScript migration
// reason: allowJs transition; types defined incrementally
/* eslint-disable @typescript-eslint/no-var-requires */
const MeetingPipeline = require('./pipeline/orchestrator')
const ConfigManager = require('./utils/config-manager')
const SetupManager = require('./utils/setup-manager')
/* eslint-enable @typescript-eslint/no-var-requires */

let mainWindow: BrowserWindow | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let configManager: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let currentPipeline: any | null = null

const setupManager = new SetupManager()

// out/main/ → ../../src/renderer/ resolves to project root /src/renderer/ in both dev and packaged ASAR
function rendererFile(html: string): string {
  return path.join(__dirname, '../../src/renderer', html)
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
    mainWindow.loadFile(rendererFile('index.html'))
  } else {
    log.info('Setup incomplete. Launching Setup Wizard...')
    log.info(`Missing components: ${(status.missing as string[])?.join(', ') ?? 'unknown'}`)
    mainWindow.loadFile(rendererFile('setup.html'))
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
        win.loadFile(rendererFile('index.html'))
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

ipcMain.handle('save-config', (_event: Electron.IpcMainInvokeEvent, config: unknown) => {
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
  // openDirectory still returns filePaths, not directoryPaths
  return result.canceled || result.filePaths.length === 0
    ? null
    : (result.filePaths[0] ?? null)
})

ipcMain.handle(
  'process-audio',
  async (_event: Electron.IpcMainInvokeEvent, audioPath: string, config: unknown) => {
    const pipeline = new MeetingPipeline(config)
    currentPipeline = pipeline
    try {
      const result = await pipeline.process(audioPath, (progress: unknown) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('processing-progress', progress)
        }
      })
      return { success: true, result }
    } finally {
      currentPipeline = null
    }
  }
)

ipcMain.handle('cancel-processing', () => {
  if (currentPipeline) {
    log.info('Cancelling current processing pipeline...')
    currentPipeline.cancel()
    return { success: true }
  }
  return { success: false, message: 'No processing in progress' }
})

ipcMain.handle('get-app-version', () => app.getVersion())
