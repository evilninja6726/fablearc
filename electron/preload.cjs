const { contextBridge } = require('electron');

// Minimal, strictly typed read-only bridge — no shell execution, no arbitrary fetch, no filesystem access
contextBridge.exposeInMainWorld('streamZDesktop', {
  platform: process.platform,
  arch: process.arch,
  isHardenedDesktop: true,
  securityCapabilities: Object.freeze({
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    zeroNativeBlobs: true,
    remoteJsExecution: false,
  }),
});
