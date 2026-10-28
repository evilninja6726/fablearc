// Hardened Electron Desktop Shell for streamZ
// Enforces sandbox: true, contextIsolation: true, nodeIntegration: false,
// blocks arbitrary navigation and file:// execution, and uses zero opaque native binaries.

const { app, BrowserWindow, session, shell } = require('electron');
const path = require('path');

function isSafeExternalHttpsUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0A0B0E',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  });

  // Block new window creation; only allow opening verified https:// links externally if explicitly requested
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalHttpsUrl(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Prevent arbitrary top-level navigation away from the app origin
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const startUrl = process.env.ELECTRON_START_URL || '';
    if (startUrl && navigationUrl.startsWith(startUrl)) {
      return;
    }
    event.preventDefault();
  });

  const startUrl = process.env.ELECTRON_START_URL;
  if (startUrl) {
    mainWindow.loadURL(startUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  // Deny dangerous permissions by default (camera, mic, geolocation, notifications, midi, etc.)
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['fullscreen', 'mediaKeySystem'];
    callback(allowed.includes(permission));
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
