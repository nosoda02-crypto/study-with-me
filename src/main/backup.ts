import { TASK_COLORS, TASK_ICONS, validDate } from '../shared/tasks'
import { DEFAULT_ACCENT_COLOR, PANEL_DEFAULTS, PANEL_LIMITS, validAccentColor } from '../shared/appearance'
import { DEFAULT_NOTIFICATION_PREFERENCES, validNoticeRule } from '../shared/notifications'
import { DEFAULT_WORK_STATES, validWorkStateDefinition } from '../shared/workStates'
import { app, dialog, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, rmSync, renameSync, existsSync } from 'fs'
import { join } from 'path'
import stats from './store'
import tasks, { getTaskData } from './tasksStore'
import { getDiaryBackup, replaceDiaryBackup } from './diaryStore'
import settings, { getWorkStates } from './settingsStore'
import { workStore, checkpointWorkState, reloadWorkState, type WorkStateSchema } from './workStateStore'
import { getAllCustomSprites, getSpriteLibraryBackup, getRemovedSeeds, listUserSpriteTags, replaceSpriteLibraryBackup, isSpriteKey, migrateRestSprite } from './spriteStore'
import study,{getStudyData} from './studyStore'
import { validStudyInput } from '../shared/study'
import music,{flushMusic} from './musicStore'

// Older backups may still carry sprites for the removed keyboard/mouse scene.
const LEGACY_POSES = ['keyboard', 'mouseIdle', 'mouseClick', 'left', 'right']

export function snapshot() {
  checkpointWorkState()
  getTaskData()
  getStudyData()
  flushMusic()
  return { format: 'study-with-me', version: 1, exportedAt: new Date().toISOString(),
    stats: stats.store, tasks: tasks.store,study:study.store,music:music.store, diary: getDiaryBackup(), settings: settings.store,
    work: workStore.store, sprites: getAllCustomSprites(), spriteLibrary:getSpriteLibraryBackup(),spriteTags:listUserSpriteTags(),spriteRemovedSeeds:getRemovedSeeds() }
}

/** Keep a recoverable full snapshot before an installed application version changes. */
export function saveUpdateSafetyBackup(fromVersion: string, toVersion: string): string {
  const directory = join(app.getPath('userData'), 'backups')
  mkdirSync(directory, { recursive: true })
  const safe = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, '_') || 'unknown'
  const file = join(directory, `update-${safe(fromVersion)}-to-${safe(toVersion)}-${Date.now()}.json`)
  writeFileSync(file, JSON.stringify(snapshot(), null, 2))
  return file
}
type Backup = ReturnType<typeof snapshot>
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const signedNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const date = (v: unknown): boolean => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const image = (v: unknown): v is string => typeof v === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(v)
const state = (v: any): boolean => typeof v === 'string' && /^[a-z0-9_-]{1,40}$/.test(v)
function segments(v: unknown): boolean {
  return Array.isArray(v) && v.every(s => object(s) && state(s.state) && number(s.startedAt) &&
    (s.endedAt === null || (number(s.endedAt) && s.endedAt >= s.startedAt)) && number(s.keystrokes)) &&
    v.every((s, i) => s.endedAt !== null || i === v.length - 1)
}
/** Validate everything before touching any live store or sprite. */
export function validateBackup(v: unknown): asserts v is Backup {
  if (!object(v) || v.format !== 'study-with-me' || v.version !== 1 ||
    !object(v.stats) || !object(v.tasks) || !object(v.diary) || !object(v.settings) || !object(v.work) || !object(v.sprites)) throw new Error('不是受支持的 Study With Me 备份文件。')
  const { stats: s, tasks: t,study:learning,music:listening, diary: d, settings: c, work: w, sprites: p, spriteLibrary, spriteTags, spriteRemovedSeeds } = v
  if (![s.totalKeystrokes, s.todayKeystrokes, s.totalRuntimeSeconds].every(number) || !date(s.todayDate) ||
    !Array.isArray(t.items) || !t.items.every(x => object(x) && typeof x.id === 'string' && typeof x.text === 'string' && typeof x.completed === 'boolean' && typeof x.daily === 'boolean' && date(x.lastResetDate)) ||
    new Set(t.items.map(x => x.id)).size !== t.items.length ||
    !t.items.every(x => (x.listId === undefined || typeof x.listId === 'string') &&
      (x.dueDate === undefined || x.dueDate === null || validDate(x.dueDate)) &&
      (x.dueTime === undefined || x.dueTime === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(x.dueTime)) &&
      (x.createdDate === undefined || validDate(x.createdDate)) &&
      (x.completedDate === undefined || x.completedDate === null || validDate(x.completedDate)) &&
      (x.completedDates === undefined || (Array.isArray(x.completedDates) && x.completedDates.every(validDate))) &&
      (x.countdown===undefined||typeof x.countdown==='boolean')) ||
    (t.lists !== undefined && (!Array.isArray(t.lists) || !t.lists.every(l => object(l) && typeof l.id === 'string' && typeof l.name === 'string' && TASK_COLORS.includes(l.color) && TASK_ICONS.includes(l.icon)) || new Set(t.lists.map(l => l.id)).size !== t.lists.length)) ||
    (learning!==undefined&&(!object(learning)||!Array.isArray(learning.items)||!learning.items.every((x:any)=>object(x)&&typeof x.id==='string'&&validStudyInput(x as any)&&Array.isArray(x.completedDates)&&x.completedDates.every(validDate)&&number(x.createdAt))||new Set(learning.items.map((x:any)=>x.id)).size!==learning.items.length))||
    (listening!==undefined&&(!object(listening)||typeof listening.enabled!=='boolean'||!object(listening.history)||!Object.entries(listening.history).every(([key,value])=>date(key)&&number(value))))||
    Object.entries(PANEL_LIMITS).some(([key, [min, max]]) => c[key] !== undefined && (!number(c[key]) || c[key] < min || c[key] > max)) ||
    !object(d.entries) || typeof d.font !== 'string' || !Object.entries(d.entries).every(([k, x]) => date(k) && object(x) && typeof x.text === 'string' && Array.isArray(x.images) && x.images.every(image)) ||
    (c.theme !== undefined && !['system', 'light', 'dark'].includes(c.theme)) ||
    (c.accentColor !== undefined && !validAccentColor(c.accentColor)) ||
    (c.lastAppVersion !== undefined && typeof c.lastAppVersion !== 'string') ||
    (c.workStates !== undefined && (!Array.isArray(c.workStates) || !c.workStates.length || !c.workStates.every(validWorkStateDefinition) || new Set(c.workStates.map((s:any)=>s.id)).size!==c.workStates.length)) ||
    (c.notifications !== undefined && (!object(c.notifications) || (c.notifications.petName !== undefined && (typeof c.notifications.petName !== 'string' || !c.notifications.petName.trim())) || !['pet', 'top-right'].includes(c.notifications.location) ||
      typeof c.notifications.hourlyEnabled !== 'boolean' || typeof c.notifications.stateHourlyEnabled !== 'boolean' || typeof c.notifications.keystrokeEnabled !== 'boolean' ||
      (c.notifications.displaySeconds!==undefined&&(!number(c.notifications.displaySeconds)||c.notifications.displaySeconds<2||c.notifications.displaySeconds>30)) ||
      !number(c.notifications.keystrokeStep) || c.notifications.keystrokeStep < 100 || !Array.isArray(c.notifications.customRules) || !c.notifications.customRules.every(validNoticeRule) ||
      (c.notifications.randomIconTags!==undefined&&(!Array.isArray(c.notifications.randomIconTags)||!c.notifications.randomIconTags.every((tag:any)=>typeof tag==='string'))) ||
      (c.notifications.iconMode!==undefined&&!['fixed','random'].includes(c.notifications.iconMode)) ||
      (c.notifications.randomIconFolders!==undefined&&(!Array.isArray(c.notifications.randomIconFolders)||!c.notifications.randomIconFolders.every((folder:any)=>typeof folder==='string'))) ||
      (c.notifications.templateIcons!==undefined&&(!object(c.notifications.templateIcons)||!Object.values(c.notifications.templateIcons).every(value=>typeof value==='string'))) ||
      (c.notifications.templates !== undefined && (!object(c.notifications.templates) || !['hourly','stateHourly','keystroke','off'].every(k=>typeof c.notifications.templates[k]==='string') || (c.notifications.templates.stateSwitch!==undefined&&typeof c.notifications.templates.stateSwitch!=='string') || (!['taskDue','taskComplete'].every(k=>typeof c.notifications.templates[k]==='string') && typeof c.notifications.templates.task!=='string'))))) ||
    !number(c.windowScale) || c.windowScale < 0.5 || c.windowScale > 2 || !number(c.windowOpacity) || c.windowOpacity < 0.2 || c.windowOpacity > 1 ||
    !date(w.date) || !segments(w.segments) || !object(w.history) || !Object.entries(w.history).every(([k, x]) => date(k) && segments(x)) ||
    (w.companionOffset !== undefined && !signedNumber(w.companionOffset)) ||
    (w.timeOffsets !== undefined && (!object(w.timeOffsets) || !Object.entries(w.timeOffsets).every(([key, value]) => state(key) && signedNumber(value)))) ||
    (w.historyResets !== undefined && (!object(w.historyResets) || !Object.entries(w.historyResets).every(([key, reset]) => date(key) && object(reset) && signedNumber(reset.companionOffset) && object(reset.timeOffsets) && Object.entries(reset.timeOffsets).every(([s, n]) => state(s) && signedNumber(n))))) ||
    !state(w.state) || typeof w.paused !== 'boolean' || (w.startedToday!==undefined&&typeof w.startedToday!=='boolean') || !number(w.checkpoint) ||
    !Object.entries(p).every(([k, x]) => (isSpriteKey(k) || LEGACY_POSES.includes(k)) && image(x)) ||
    (spriteLibrary!==undefined&&(!Array.isArray(spriteLibrary)||!spriteLibrary.every(x=>object(x)&&typeof x.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(x.id)&&typeof x.name==='string'&&x.name.length<=40&&((Array.isArray(x.tags)&&x.tags.length<=20&&x.tags.every((tag:any)=>typeof tag==='string'&&tag.length<=40))||(typeof x.folder==='string'&&x.folder.length<=40&&typeof x.character==='string'&&x.character.length<=40&&typeof x.ip==='string'&&x.ip.length<=40))&&image(x.image))||new Set(spriteLibrary.map((x:any)=>x.id)).size!==spriteLibrary.length)) ||
    (spriteTags!==undefined&&(!Array.isArray(spriteTags)||spriteTags.length>100||!spriteTags.every((tag:any)=>typeof tag==='string'&&tag.trim().length>0&&tag.length<=40)))||
    (spriteRemovedSeeds!==undefined&&(!Array.isArray(spriteRemovedSeeds)||spriteRemovedSeeds.length>500||!spriteRemovedSeeds.every((id:any)=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(id))))) throw new Error('备份内容不完整或含有无效数据，未导入。')
}
export async function exportBackup(parent: BrowserWindow, prepare: () => void = () => {}): Promise<string | null> {
  const result = await dialog.showSaveDialog(parent, {
    title: '导出全部记录与贴图', defaultPath: join(app.isPackaged ? app.getPath('documents') : app.getAppPath(), `study-with-me-${Date.now()}.json`),
    filters: [{ name: 'Study With Me 备份', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return null
  prepare()
  writeFileSync(result.filePath, JSON.stringify(snapshot(), null, 2))
  return result.filePath
}
export async function importBackup(parent: BrowserWindow, prepare: () => void = () => {}): Promise<boolean> {
  const result = await dialog.showOpenDialog(parent, { title: '导入全部记录与贴图', properties: ['openFile'], filters: [{ name: 'Study With Me 备份', extensions: ['json'] }] })
  if (result.canceled || !result.filePaths[0]) return false
  const data: unknown = JSON.parse(readFileSync(result.filePaths[0], 'utf8'))
  validateBackup(data)
  const answer = await dialog.showMessageBox(parent, { type: 'warning', title: '导入备份',
    message: '用备份替换当前全部记录、设置和贴图？',
    detail: '导入前会自动保存当前数据的恢复备份。导入后的计时保持暂停，点击继续才会开始记录。',
    buttons: ['取消', '导入并替换'], defaultId: 0, cancelId: 0 })
  if (answer.response !== 1) return false
  prepare()
  const previous = snapshot()
  const root = app.getPath('userData')
  const recovery = join(root, 'backups')
  mkdirSync(recovery, { recursive: true })
  writeFileSync(join(recovery, `before-import-${Date.now()}.json`), JSON.stringify(previous))
  const staging = join(root, 'sprites-import')
  const live = join(root, 'sprites')
  const old = join(root, 'sprites-before-import')
  rmSync(staging, { recursive: true, force: true }); mkdirSync(staging)
  for (const [pose, url] of Object.entries(data.sprites)) {
    if (!isSpriteKey(pose)) continue
    const [, mime, base64] = /^data:image\/(png|jpeg|webp|gif);base64,(.*)$/.exec(url!)!
    writeFileSync(join(staging, `${pose}.${mime === 'jpeg' ? 'jpg' : mime}`), Buffer.from(base64, 'base64'))
  }
  let swapped = false
  try {
    rmSync(old, { recursive: true, force: true })
    if (existsSync(live)) renameSync(live, old)
    renameSync(staging, live); swapped = true
    stats.store = data.stats; tasks.store = data.tasks;study.store=data.study??{items:[]};music.store=data.music??{enabled:false,history:{}}; replaceDiaryBackup(data.diary); settings.store = { ...PANEL_DEFAULTS, ...data.settings, accentColor:data.settings.accentColor ?? DEFAULT_ACCENT_COLOR, workStates: data.settings.workStates ?? DEFAULT_WORK_STATES, notifications: { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(data.settings.notifications ?? {}), templates:{...DEFAULT_NOTIFICATION_PREFERENCES.templates,...(data.settings.notifications?.templates ?? {})},templateIcons:{...DEFAULT_NOTIFICATION_PREFERENCES.templateIcons,...(data.settings.notifications?.templateIcons??{})},randomIconTags:data.settings.notifications?.randomIconTags??(data.settings.notifications as any)?.randomIconFolders??[] }, visualVersion: data.settings.visualVersion ?? 1, theme: data.settings.theme ?? 'system' }
    replaceSpriteLibraryBackup(data.spriteLibrary ?? [],data.spriteTags??[],data.spriteRemovedSeeds)
    // Older backups carry a shared rest image; turn it into per-state images.
    migrateRestSprite(getWorkStates().filter(state=>state.id!=='focus').map(state=>state.id))
    const work: WorkStateSchema = structuredClone(data.work)
    work.startedToday=work.startedToday??work.segments.length>0
    for (const s of work.segments) if (s.endedAt === null) s.endedAt = Math.max(s.startedAt, work.checkpoint)
    work.paused = true
    workStore.store = work
    reloadWorkState()
    getTaskData()
    rmSync(old, { recursive: true, force: true })
    return true
  } catch (error) {
    stats.store = previous.stats; tasks.store = previous.tasks;study.store=previous.study;music.store=previous.music; replaceDiaryBackup(previous.diary)
    settings.store = previous.settings; workStore.store = previous.work;replaceSpriteLibraryBackup(previous.spriteLibrary,previous.spriteTags,previous.spriteRemovedSeeds)
    if (swapped) rmSync(live, { recursive: true, force: true })
    if (existsSync(old)) renameSync(old, live)
    throw error
  } finally { rmSync(staging, { recursive: true, force: true }) }
}
