export const WORK_STATE_COLORS = ['#007aff', '#34c759', '#ff9500', '#af52de', '#ff3b30', '#5ac8fa'] as const
export const WORK_STATE_ICONS = ['briefcase', 'waves', 'cup', 'people', 'moon', 'book', 'heart', 'star'] as const
export type WorkStateIcon = typeof WORK_STATE_ICONS[number]
export interface WorkStateDefinition { id: string; label: string; color: string; icon: WorkStateIcon }
export const DEFAULT_WORK_STATES: WorkStateDefinition[] = [
  { id:'focus', label:'工作中', color:'#007aff', icon:'briefcase' },
  { id:'break', label:'摸鱼中', color:'#5ac8fa', icon:'waves' },
  { id:'lunch', label:'午休中', color:'#ff9500', icon:'cup' },
  { id:'meeting', label:'开会中', color:'#af52de', icon:'people' },
  { id:'off', label:'下班了', color:'#ff3b30', icon:'moon' }
]
export const WORK_STATE_PATHS: Record<WorkStateIcon,string> = {
  briefcase:'M8 6V4h8v2M4 7h16v13H4zM4 12h16M10 12v3h4v-3',
  waves:'M3 8c3-5 6 5 9 0s6 5 9 0M3 15c3-5 6 5 9 0s6 5 9 0',
  cup:'M4 8h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 9h2a3 3 0 0 1 0 6h-2M3 22h16M8 3v2M12 2v3',
  people:'M15 20v-2a5 5 0 0 0-10 0v2M10 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6M17 5a3 3 0 0 1 0 6M19 20v-2a5 5 0 0 0-2-4',
  moon:'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11z',
  book:'M4 5h6a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H4zM20 5h-6a3 3 0 0 0-3 3v12a3 3 0 0 1 3-3h6z',
  heart:'M20 8c0 6-8 11-8 11S4 14 4 8a4 4 0 0 1 7-2 4 4 0 0 1 9 2z',
  star:'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z'
}
export function validWorkStateDefinition(value: unknown): value is WorkStateDefinition {
  if (!value || typeof value !== 'object') return false
  const v=value as WorkStateDefinition
  return /^[a-z0-9_-]{1,40}$/.test(v.id) && typeof v.label==='string' && v.label.trim().length>0 && v.label.length<=12 &&
    WORK_STATE_COLORS.includes(v.color as any) && WORK_STATE_ICONS.includes(v.icon as any)
}
