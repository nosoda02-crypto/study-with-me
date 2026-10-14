import { uIOhook,type UiohookMouseEvent } from 'uiohook-napi'

let started = false
let listenerAttached = false

export interface InputCallbacks {
  onKeydown: () => void
  onMouseDown: (event:UiohookMouseEvent) => void
  onMouseUp: (event:UiohookMouseEvent) => void
}

/**
 * Listens to keyboard and mouse events system-wide (not just inside our
 * window), since the cat window is usually click-through / unfocused while
 * the user types or clicks in some other app.
 *
 * On macOS this needs the "Accessibility" permission (System Settings →
 * Privacy & Security → Accessibility). If it isn't granted yet, uiohook
 * throws synchronously - we catch that so the rest of the app still works,
 * just without input tracking until the user grants it and retries.
 */
export function startInputListener(callbacks: InputCallbacks): boolean {
  if (started) return true

  if (!listenerAttached) {
    uIOhook.on('keydown', () => callbacks.onKeydown())
    uIOhook.on('mousedown', event => callbacks.onMouseDown(event))
    uIOhook.on('mouseup', event => callbacks.onMouseUp(event))
    listenerAttached = true
  }

  try {
    uIOhook.start()
    started = true
    return true
  } catch (error) {
    console.warn(
      '[inputListener] failed to start global input hook (likely missing Accessibility permission):',
      error
    )
    return false
  }
}

export function stopInputListener(): void {
  if (!started) return
  uIOhook.stop()
  started = false
}
