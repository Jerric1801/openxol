const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const log = require('electron-log');
const MeetingPipeline = require('./pipeline/orchestrator');
const ConfigManager = require('./utils/config-manager');
const SetupManager = require('./utils/setup-manager');

let mainWindow;
let configManager;
let setupManager;
let currentPipeline = null; // Store current pipeline for cancellation

// Initialize SetupManager early (before app.whenReady)
setupManager = new SetupManager();

async function createWindow() {
  // GATEWAY PATTERN: Check setup status BEFORE creating window
  // We explicitly verify files on disk, not just a "flag" in a json file
  const status = await setupManager.checkSetupComplete();
  const isSetupComplete = status.complete;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // ROUTING LOGIC: Bypass setup if ready
  if (isSetupComplete) {
    log.info('Setup complete. Launching Main App...');
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  } else {
    log.info('Setup incomplete. Launching Setup Wizard...');
    log.info(`Missing components: ${status.missing?.join(', ') || 'unknown'}`);
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'setup.html'));
  }

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(async () => {
  configManager = new ConfigManager();
  await configManager.init();
  
  // Remove existing handlers if they exist (prevents duplicate registration errors)
  // removeHandler() is safe to call even if handler doesn't exist
  ipcMain.removeHandler('perform-setup');
  ipcMain.removeHandler('check-setup-status');
  ipcMain.removeAllListeners('setup-finished');
  
  // Register IPC handlers for the Setup Wizard
  ipcMain.handle('perform-setup', async (event) => {
    // Pass progress updates back to the renderer
    return await setupManager.performSetup((progressObj) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('progress-update', progressObj);
      }
    });
  });

  ipcMain.handle('check-setup-status', async () => {
    return await setupManager.checkSetupComplete();
  });

  // Handler to relaunch after setup finishes
  ipcMain.on('setup-finished', async () => {
    log.info('Setup finished, reloading to main app...');
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      // Re-check setup status and route accordingly
      const status = await setupManager.checkSetupComplete();
      if (status.complete) {
        win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
      } else {
        // Still incomplete, stay on setup screen
        log.warn('Setup marked complete but files still missing');
      }
    }
  });

  createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('get-config', async () => {
  return configManager.getConfig();
});

ipcMain.handle('save-config', async (event, config) => {
  return configManager.saveConfig(config);
});

ipcMain.handle('select-audio-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('select-output-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });

  if (!result.canceled && result.directoryPaths.length > 0) {
    return result.directoryPaths[0];
  }
  return null;
});

ipcMain.handle('process-audio', async (event, audioPath, config) => {
  // TODO: Consider moving pipeline processing to UtilityProcess to avoid blocking
  // the main process event loop when processing large files/transcripts.
  // See: https://www.electronjs.org/docs/latest/api/utility-process
  const pipeline = new MeetingPipeline(config);
  currentPipeline = pipeline; // Store for cancellation
  
  try {
    // Pass progress callback to send updates to renderer
    const result = await pipeline.process(audioPath, (progress) => {
      // Send progress updates to renderer process
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('processing-progress', progress);
      }
    });
    
    // Always return success: true
    // Check result.errors for critical failures
    return { success: true, result };
  } finally {
    currentPipeline = null; // Clear reference when done
  }
});

ipcMain.handle('cancel-processing', async () => {
  if (currentPipeline) {
    log.info('Cancelling current processing pipeline...');
    currentPipeline.cancel();
    return { success: true };
  }
  return { success: false, message: 'No processing in progress' };
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// Note: Setup handlers are registered in app.whenReady() to prevent duplicate registration errors

