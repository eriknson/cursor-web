import path from 'node:path';
import { app, BrowserWindow, ipcMain, shell, Menu } from 'electron';
import Store from 'electron-store';

const isDev = !!process.env.VITE_DEV_SERVER_URL || !app.isPackaged;

const windowStateStore = new Store<{ width: number; height: number; x?: number; y?: number; isMaximized?: boolean }>({
  name: 'window-state',
  defaults: {
    width: 1280,
    height: 800,
    isMaximized: false,
  },
});

function createMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', visible: isDev },
        { role: 'forcereload', visible: isDev },
        { role: 'toggledevtools', visible: isDev },
        { type: 'separator' },
        { role: 'resetzoom' },
        { role: 'zoomin' },
        { role: 'zoomout' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      role: 'window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Cursor Docs',
          click: () => shell.openExternal('https://cursor.com/docs'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

const createWindow = async () => {
  const { width, height, x, y, isMaximized } = windowStateStore.store;

  const mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  mainWindow.on('close', () => {
    const bounds = mainWindow.getBounds();
    windowStateStore.set('width', bounds.width);
    windowStateStore.set('height', bounds.height);
    windowStateStore.set('x', bounds.x);
    windowStateStore.set('y', bounds.y);
    windowStateStore.set('isMaximized', mainWindow.isMaximized());
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const indexHtml = path.join(__dirname, 'renderer', 'index.html');
    await mainWindow.loadFile(indexHtml);
  }
};

app.whenReady().then(() => {
  createMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('ping', () => 'pong');
