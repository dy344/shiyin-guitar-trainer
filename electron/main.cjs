const { app, BrowserWindow, session, dialog, shell } = require('electron')
const { externalURL } = require('./external.cjs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const entry = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#121614',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    const target = externalURL(url)
    if (target) void shell.openExternal(target).catch(error => dialog.showErrorBox('无法打开浏览器', error.message))
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => { if (url !== entry) event.preventDefault() })
  window.loadURL(entry).catch((error) => dialog.showErrorBox('启动失败', error.message))
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(contents?.getURL() === entry && permission === 'media' && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio'))
  session.defaultSession.setPermissionCheckHandler((contents, permission, origin, details) => contents?.getURL() === entry && permission === 'media' && details.mediaType === 'audio')
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
