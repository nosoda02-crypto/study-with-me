export interface PanelPreferences {
  /** Legacy shared values retained so old backups continue to import. */
  panelScale:number
  panelOpacity:number
  panelFontScale:number
  singleScale:number
  singleOpacity:number
  hubOpacity:number
  notificationScale:number
  notificationOpacity:number
}
export const DEFAULT_ACCENT_COLOR = '#007aff'
export const ACCENT_PRESETS = [
  { color:'#007aff', label:'蓝色' },
  { color:'#5856d6', label:'靛蓝' },
  { color:'#af52de', label:'紫色' },
  { color:'#ff2d55', label:'粉色' },
  { color:'#ff3b30', label:'红色' },
  { color:'#ff9500', label:'橙色' },
  { color:'#b87900', label:'黄色' },
  { color:'#248a3d', label:'绿色' },
  { color:'#008f7a', label:'薄荷' },
  { color:'#007f8b', label:'青色' }
] as const
export function validAccentColor(value: unknown): value is string { return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) }
export const PANEL_DEFAULTS: PanelPreferences = { panelScale:1,panelOpacity:1,panelFontScale:1,singleScale:1,singleOpacity:1,hubOpacity:1,notificationScale:1,notificationOpacity:1 }
export const PANEL_LIMITS = { panelScale:[0.8,1.5],panelOpacity:[0.4,1],panelFontScale:[0.85,1.3],singleScale:[0.7,1.6],singleOpacity:[0.35,1],hubOpacity:[0.4,1],notificationScale:[0.7,1.6],notificationOpacity:[0.35,1] } as const
export function bubbleBaseHeight(fontScale: number): number { return Math.ceil(306 + Math.max(0, fontScale - 1) * 270) }
