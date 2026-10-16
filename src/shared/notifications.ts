export type NoticeLocation = 'pet' | 'top-right'
export type NoticeSchedule = 'weekdays' | 'weekends' | 'custom'
export type NoticeTemplateKey = 'hourly'|'stateSwitch'|'stateHourly'|'keystroke'|'taskDue'|'taskComplete'|'off'

export interface CustomNoticeRule {
  id: string
  time: string
  message: string
  schedule: NoticeSchedule
  days: number[]
  enabled: boolean
  iconSpriteId?: string
}

export type NoticeIconMode = 'fixed' | 'random'
export const effectiveIconMode = (prefs: Pick<NotificationPreferences, 'iconMode' | 'randomIconTags'>): NoticeIconMode =>
  prefs.iconMode === 'fixed' || prefs.iconMode === 'random' ? prefs.iconMode : prefs.randomIconTags.length ? 'random' : 'fixed'

export interface NotificationPreferences {
  petName: string
  location: NoticeLocation
  displaySeconds: number
  hourlyEnabled: boolean
  stateHourlyEnabled: boolean
  keystrokeEnabled: boolean
  keystrokeStep: number
  customRules: CustomNoticeRule[]
  randomIconTags: string[]
  /** Message avatar: one fixed image, or a random sticker carrying all `randomIconTags`. Unset = random when tags are chosen. */
  iconMode?: NoticeIconMode
  templateIcons: Record<NoticeTemplateKey,string>
  templates: Record<NoticeTemplateKey,string>
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  petName: '小猫',
  location: 'pet',
  displaySeconds: 6.5,
  hourlyEnabled: true,
  stateHourlyEnabled: true,
  keystrokeEnabled: true,
  keystrokeStep: 1000,
  customRules: [],
  randomIconTags: [],
  templateIcons: { hourly:'',stateSwitch:'',stateHourly:'',keystroke:'',taskDue:'',taskComplete:'',off:'' },
  templates: {
    hourly: '现在是 {time}，我还在陪着你。',
    stateSwitch: '已切换到“{state}”，接下来也一起加油。',
    stateHourly: '已经保持“{state}”{hours} 小时了，记得看看自己是否需要休息。',
    keystroke: '今天已经敲击 {count} 次，我都替你记下来了。',
    taskDue: '“{task}”到时间了，别忘记处理。',
    taskComplete: '“{task}”已经完成，做得不错。',
    off: '今日专注 {hours} 小时，累计敲击 {count} 次。工作辛苦了，去休息吧。'
  }
}

export function renderNoticeTemplate(template: string, values: Record<string,string|number>): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (match,key) => key in values ? String(values[key]) : match)
}

export function validNoticeRule(value: unknown): value is CustomNoticeRule {
  if (!value || typeof value !== 'object') return false
  const v = value as CustomNoticeRule
  return typeof v.id === 'string' && typeof v.message === 'string' && v.message.trim().length > 0 &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(v.time) && ['weekdays', 'weekends', 'custom'].includes(v.schedule) &&
    Array.isArray(v.days) && v.days.every(day => Number.isInteger(day) && day >= 0 && day <= 6) && typeof v.enabled === 'boolean' &&
    (v.iconSpriteId===undefined||typeof v.iconSpriteId==='string')
}

export function noticeRuleMatches(rule: CustomNoticeRule, now: Date): boolean {
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const day = now.getDay()
  const scheduled = rule.schedule === 'weekdays' ? day >= 1 && day <= 5 : rule.schedule === 'weekends' ? day === 0 || day === 6 : rule.days.includes(day)
  return rule.enabled && scheduled && rule.time === time
}

export function isKeystrokeMilestone(count: number, preferences: NotificationPreferences): boolean {
  return preferences.keystrokeEnabled && count > 0 && count % preferences.keystrokeStep === 0
}
