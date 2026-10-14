import { useEffect, useRef } from 'react'

/**
 * Like setInterval, but paused while this window is hidden. Hidden panels stay
 * alive for instant reopening; this keeps them from polling the main process.
 * Runs `callback` immediately whenever the window becomes visible again.
 */
export function useVisibleInterval(callback: () => void, ms: number, deps: unknown[] = []): void {
  const saved = useRef(callback)
  saved.current = callback
  useEffect(() => {
    let timer: number | undefined
    const start = () => { if (timer === undefined) timer = window.setInterval(() => saved.current(), ms) }
    const stop = () => { clearInterval(timer); timer = undefined }
    start()
    const off = window.api.onWindowVisibility(visible => {
      if (!visible) return stop()
      saved.current(); start()
    })
    return () => { stop(); off() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps])
}
