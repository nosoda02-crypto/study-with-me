import { app, Menu, Tray, nativeImage } from 'electron'
import { join } from 'path'

interface TrayCallbacks {
  isVisible: () => boolean
  isClickThrough: () => boolean
  isKeyTrackingActive: () => boolean
  toggleVisible: () => void
  toggleClickThrough: () => void
  openStatus: () => void
  openHub: () => void
  openSpriteSettings: () => void
  openWindowSettings: () => void
  retryKeyTracking: () => void
  /** Dev build only: the compiled code changed since this process started. */
  hasCodeUpdate?: () => boolean
}

export interface TrayHandle {
  tray: Tray
  refresh: () => void
}

export function createTray(callbacks: TrayCallbacks): TrayHandle {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'trayIconTemplate.png')
    : join(__dirname, '../../resources/trayIconTemplate.png')

  const icon = nativeImage.createFromPath(iconPath)
  const tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('Study With Me')

  const rebuildMenu = (): void => {
    const menu = Menu.buildFromTemplate([
      ...(callbacks.hasCodeUpdate?.()
        ? ([
            // app.quit() runs the normal will-quit flush before the relaunch.
            { label: '⟳ 代码已更新，点击重启', click: () => { app.relaunch(); app.quit() } },
            { type: 'separator' }
          ] as Electron.MenuItemConstructorOptions[])
        : []),
      {
        label: callbacks.isVisible() ? '隐藏桌宠' : '显示桌宠',
        click: () => {
          callbacks.toggleVisible()
          rebuildMenu()
        }
      },
      {
        label: '鼠标穿透',
        type: 'checkbox',
        checked: callbacks.isClickThrough(),
        click: () => {
          callbacks.toggleClickThrough()
          rebuildMenu()
        }
      },
      { type: 'separator' },
      { label: '当前状态与计时', click: () => callbacks.openStatus() },
      { label: '陪伴手帐（任务 / 日记 / 备份）', click: () => callbacks.openHub() },
      { label: '贴图库', click: () => callbacks.openSpriteSettings() },
      { label: '窗口设置', click: () => callbacks.openWindowSettings() },
      ...(callbacks.isKeyTrackingActive()
        ? []
        : ([
            {
              label: '⚠️ 未获得辅助功能权限，点击重试',
              click: () => {
                callbacks.retryKeyTracking()
                rebuildMenu()
              }
            }
          ] as Electron.MenuItemConstructorOptions[])),
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ])
    tray.setContextMenu(menu)
  }

  rebuildMenu()
  return { tray, refresh: rebuildMenu }
}
