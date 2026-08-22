import { app, BrowserWindow, nativeImage, shell } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'

let mainWindow: BrowserWindow | null = null

app.setName('Hoist')
if (process.platform === 'win32') {
  app.setAppUserModelId('app.hoist')
}

const appIcon = nativeImage.createFromPath(join(__dirname, '../../build/icon.png'))

// electron-liquid-glass is darwin-only and lives in optionalDependencies,
// so it isn't installed on Linux/Windows. We dynamic-import it on darwin
// only and let the ambient types in ./types/electron-liquid-glass.d.ts
// keep typecheck green when the package is absent.
async function applyLiquidGlass(handle: Buffer): Promise<void> {
  if (process.platform !== 'darwin') return
  try {
    const { default: liquidGlass } = await import('electron-liquid-glass')
    liquidGlass.addView(handle, { cornerRadius: 12, tintColor: '#12121459' })
  } catch { /* glass unsupported on this macOS version — window stays transparent */ }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 600,
    title: 'Hoist',
    icon: appIcon,
    // titleBarStyle: 'hiddenInset' removes the OS title bar but keeps
    // the macOS traffic-light buttons; we draw our own titlebar in the
    // renderer starting at 0,0, and the lights are placed at the
    // leftmost position so the design system owns the chrome.
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 16 },
    backgroundColor: process.platform === 'darwin' ? '#00000000' : '#121214',
    ...(process.platform === 'darwin' ? { transparent: true } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL(process.env.HOIST_DEV_URL ?? 'http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (process.platform === 'darwin') {
    mainWindow.webContents.once('did-finish-load', () => {
      void applyLiquidGlass(mainWindow!.getNativeWindowHandle())
    })
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
