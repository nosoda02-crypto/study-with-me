import { DEFAULT_ACCENT_COLOR, PANEL_DEFAULTS, PANEL_LIMITS, validAccentColor, type PanelPreferences } from '../shared/appearance'
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from '../shared/notifications'
import { DEFAULT_WORK_STATES, validWorkStateDefinition, type WorkStateDefinition } from '../shared/workStates'
import Store from './cachedStore'

export type ThemeMode = 'system' | 'light' | 'dark'
export interface SettingsSchema extends PanelPreferences {
  visualVersion: number
  lastAppVersion: string
  theme: ThemeMode
  accentColor: string
  windowScale: number
  windowOpacity: number
  notifications: NotificationPreferences
  workStates: WorkStateDefinition[]
}

const store = new Store<SettingsSchema>({
  name: 'settings',
  defaults: {
    ...PANEL_DEFAULTS,
    theme: 'system',
    accentColor: DEFAULT_ACCENT_COLOR,
    visualVersion: 0,
    lastAppVersion: '',
    windowScale: 1,
    windowOpacity: 1,
    notifications: DEFAULT_NOTIFICATION_PREFERENCES,
    workStates: DEFAULT_WORK_STATES
  }
})

export const MIN_SCALE = 0.5
export const MAX_SCALE = 2
export const MIN_OPACITY = 0.2
export const MAX_OPACITY = 1

export function getWindowScale(): number {
  return store.get('windowScale')
}

export function setWindowScale(value: number): void {
  store.set('windowScale', Math.min(MAX_SCALE, Math.max(MIN_SCALE, value)))
}

export function getWindowOpacity(): number {
  return store.get('windowOpacity')
}

export function setWindowOpacity(value: number): void {
  store.set('windowOpacity', Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, value)))
}

export default store

export function getTheme(): ThemeMode { return store.get('theme') }
export function setTheme(theme: ThemeMode): void { store.set('theme', theme) }
export function getAccentColor(): string { const value=store.get('accentColor');return validAccentColor(value)?value.toLowerCase():DEFAULT_ACCENT_COLOR }
export function setAccentColor(color: string): string { if(!validAccentColor(color))throw new Error('颜色无效');const value=color.toLowerCase();store.set('accentColor',value);return value }

export function getPanelPreferences(): PanelPreferences {
  const panelScale=store.get('panelScale')??1,panelOpacity=store.get('panelOpacity')??1
  return {panelScale,panelOpacity,panelFontScale:store.get('panelFontScale')??1,
    singleScale:store.get('singleScale')??panelScale,singleOpacity:store.get('singleOpacity')??panelOpacity,
    hubOpacity:store.get('hubOpacity')??panelOpacity,notificationScale:store.get('notificationScale')??1,
    notificationOpacity:store.get('notificationOpacity')??panelOpacity}
}
export function setPanelPreference(key: keyof PanelPreferences, value: number): void {
  if (!(key in PANEL_LIMITS) || !Number.isFinite(value)) return
  const [min, max] = PANEL_LIMITS[key]
  store.set(key, Math.min(max, Math.max(min, value)))
}

export function getNotificationPreferences(): NotificationPreferences {
  const saved = store.get('notifications') as (NotificationPreferences & {randomIconFolders?:string[]})|undefined
  const randomIconTags=Array.isArray(saved?.randomIconTags)?saved.randomIconTags:Array.isArray(saved?.randomIconFolders)?saved.randomIconFolders:[]
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(saved ?? {}), templates: { ...DEFAULT_NOTIFICATION_PREFERENCES.templates, ...(saved?.templates ?? {}) }, templateIcons:{...DEFAULT_NOTIFICATION_PREFERENCES.templateIcons,...(saved?.templateIcons??{})},randomIconTags, customRules: Array.isArray(saved?.customRules) ? saved.customRules : [] }
}

export function setNotificationPreferences(value: NotificationPreferences): NotificationPreferences {
  const merged={...getNotificationPreferences(),...value}
  const next = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...merged, petName:merged.petName.trim(),displaySeconds:Math.min(30,Math.max(2,Number(merged.displaySeconds)||6.5)), templates:{...DEFAULT_NOTIFICATION_PREFERENCES.templates,...merged.templates},templateIcons:{...DEFAULT_NOTIFICATION_PREFERENCES.templateIcons,...merged.templateIcons},randomIconTags:[...new Set(merged.randomIconTags.map(tag=>tag.trim()).filter(Boolean))], keystrokeStep: Math.max(100, Math.round(merged.keystrokeStep)), customRules: merged.customRules }
  store.set('notifications', next)
  return next
}

export function getLastAppVersion(): string { return store.get('lastAppVersion') ?? '' }
export function setLastAppVersion(version: string): void { store.set('lastAppVersion', version) }

export function getWorkStates(): WorkStateDefinition[] {
  const saved=store.get('workStates')
  return Array.isArray(saved) && saved.length && saved.every(validWorkStateDefinition) ? saved : DEFAULT_WORK_STATES
}
export function setWorkStates(states: WorkStateDefinition[]): WorkStateDefinition[] {
  if (!states.length || !states.every(validWorkStateDefinition) || new Set(states.map(s=>s.id)).size!==states.length) throw new Error('状态设置无效')
  const cleaned=states.map(s=>({...s,label:s.label.trim()}));store.set('workStates',cleaned);return cleaned
}
