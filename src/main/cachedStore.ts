import Store from 'electron-store'

const FLUSH_DELAY_MS = 1000
const instances = new Set<CachedStore<any>>()

/**
 * electron-store re-reads and JSON-parses its file on every `get` and rewrites
 * the whole file on every `set`. Hot paths (one call per keystroke, 1s ticks)
 * made that dominate main-thread time, so reads come from memory and writes
 * are coalesced into one disk write per FLUSH_DELAY_MS. Values are cloned on
 * the way in and out, matching electron-store's copy semantics.
 */
export default class CachedStore<T extends Record<string, any>> {
  private readonly inner: Store<T>
  private data: T
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(options: { name: string; defaults: T }) {
    this.inner = new Store<T>(options)
    this.data = this.inner.store
    instances.add(this)
  }

  get<K extends keyof T>(key: K): T[K] {
    return structuredClone(this.data[key])
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    this.data[key] = structuredClone(value)
    this.scheduleFlush()
  }

  get store(): T {
    return structuredClone(this.data)
  }

  /** Whole-store replacement (backup import/rollback) is written immediately. */
  set store(value: T) {
    this.data = structuredClone(value)
    if (this.timer !== undefined) { clearTimeout(this.timer); this.timer = undefined }
    this.inner.store = this.data
  }

  /** Write pending changes now (no-op when nothing is pending). */
  flush(): void {
    if (this.timer === undefined) return
    clearTimeout(this.timer); this.timer = undefined
    this.inner.store = this.data
  }

  private scheduleFlush(): void {
    // No timers (unit-test sandbox): behave like the plain write-through store.
    if (typeof setTimeout !== 'function') { this.inner.store = this.data; return }
    if (this.timer === undefined) this.timer = setTimeout(() => { this.timer = undefined; this.inner.store = this.data }, FLUSH_DELAY_MS)
  }
}

/** Write any pending changes to disk; call before quitting. */
export function flushAllStores(): void {
  for (const store of instances) store.flush()
}
