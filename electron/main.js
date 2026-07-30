const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const {
  initDatabase,
  connectCloudAndSync,
  getSyncStatus,
  isHybridMode,
  isCloudAvailable,
  startConnectivityMonitor,
  setConnectivityChangeHandler,
} = require('./database');
const { isOfflineMode } = require('./offlineMode');
const orcamentos = require('./orcamentos');
const orcamentosPlanejados = require('./orcamentosPlanejados');
const entregas = require('./entregas');
const auth = require('./auth');
const { initImages } = require('./images');
const { createHandlers } = require('./createHandlers');

const isDev = !app.isPackaged;

let mainWindow = null;
let allowClose = false;

function createWindow() {
  allowClose = false;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'SysCedro',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('close', (e) => {
    if (allowClose) return;
    e.preventDefault();
    mainWindow.webContents.send('app:close-request');
  });
}

ipcMain.on('app:close-confirmed', () => {
  allowClose = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});

function registerHandlers() {
  const handlers = createHandlers({
    getMainWindow: () => mainWindow,
    openExternal: (url) => shell.openExternal(url),
  });

  Object.entries(handlers).forEach(([channel, handler]) => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        auth.assertChannelAccess(channel);
        return { success: true, data: await handler(event, ...args) };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  });
}

app.whenReady().then(async () => {
  try {
    let cloudWasAvailable = false;
    setConnectivityChangeHandler((status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('connectivity:changed', status);
      }
      if (status.cloud && !cloudWasAvailable && isHybridMode()) {
        entregas.backfillEntregasExistentes()
          .then(() => orcamentos.marcarOrcamentosExpirados())
          .then(() => orcamentosPlanejados.marcarOrcamentosPlanejadosExpirados())
          .catch((err) => console.error('Erro pós-reconexão:', err));
      }
      cloudWasAvailable = Boolean(status.cloud);
    });

    await initDatabase({ skipStartupSync: isHybridMode() });
    await initImages();
    registerHandlers();
    createWindow();

    if (isHybridMode()) {
      startConnectivityMonitor(15000);
      connectCloudAndSync()
        .then(async () => {
          if (isCloudAvailable()) {
            await entregas.backfillEntregasExistentes();
            await orcamentos.marcarOrcamentosExpirados();
            await orcamentosPlanejados.marcarOrcamentosPlanejadosExpirados();
          }
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('sync:completed', getSyncStatus());
            mainWindow.webContents.send('connectivity:changed', {
              hybrid: true,
              cloud: isCloudAvailable(),
              offline: isOfflineMode(),
            });
          }
        })
        .catch((error) => {
          console.error('Erro ao conectar Supabase:', error);
        });
    } else {
      entregas.backfillEntregasExistentes()
        .then(() => orcamentos.marcarOrcamentosExpirados())
        .then(() => orcamentosPlanejados.marcarOrcamentosPlanejadosExpirados())
        .catch((error) => {
          console.error('Erro nas tarefas pós-abertura:', error);
        });
    }
  } catch (error) {
    console.error('Erro ao iniciar:', error);
    dialog.showErrorBox(
      'SysCedro — Erro ao iniciar',
      error?.message || 'Falha desconhecida ao iniciar o aplicativo.'
    );
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
