import { todayStr } from '../shared/date'
import Store from './cachedStore'

export interface StatsSchema {
  totalKeystrokes: number
  todayKeystrokes: number
  todayDate: string
  totalRuntimeSeconds: number
}

const store = new Store<StatsSchema>({
  name: 'stats',
  defaults: {
    totalKeystrokes: 0,
    todayKeystrokes: 0,
    todayDate: todayStr(),
    totalRuntimeSeconds: 0
  }
})


function ensureTodayFresh(): void {
  if (store.get('todayDate') !== todayStr()) {
    store.set('todayDate', todayStr())
    store.set('todayKeystrokes', 0)
  }
}

export function recordKeystroke(): void {
  ensureTodayFresh()
  store.set('totalKeystrokes', store.get('totalKeystrokes') + 1)
  store.set('todayKeystrokes', store.get('todayKeystrokes') + 1)
}

export function addRuntimeSeconds(seconds: number): void {
  if (seconds <= 0) return
  store.set('totalRuntimeSeconds', store.get('totalRuntimeSeconds') + Math.round(seconds))
}

export interface StatsSnapshot {
  totalKeystrokes: number
  todayKeystrokes: number
  totalRuntimeSeconds: number
  sessionRuntimeSeconds: number
}

export function getStats(sessionRuntimeSeconds: number): StatsSnapshot {
  ensureTodayFresh()
  return {
    totalKeystrokes: store.get('totalKeystrokes'),
    todayKeystrokes: store.get('todayKeystrokes'),
    totalRuntimeSeconds: store.get('totalRuntimeSeconds'),
    sessionRuntimeSeconds: Math.round(sessionRuntimeSeconds)
  }
}

export default store
