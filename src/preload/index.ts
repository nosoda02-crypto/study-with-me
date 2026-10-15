import type { PanelPreferences } from '../shared/appearance'
import type { NotificationPreferences } from '../shared/notifications'
import type { WorkStateDefinition } from '../shared/workStates'
import type { TaskItem, TaskOptions, TaskPatch, TaskList, TaskData } from '../shared/tasks'
import type { CheckinPeriod, WorkStatistics } from '../shared/statistics'
import type { StudyData, StudyTask, StudyTaskInput } from '../shared/study'
import type { MusicSnapshot,MusicStatistics } from '../shared/music'
export type { TaskItem } from '../shared/tasks'
import { contextBridge, ipcRenderer } from 'electron'

export interface StatsSnapshot {
  totalKeystrokes: number
  todayKeystrokes: number
  totalRuntimeSeconds: number
  sessionRuntimeSeconds: number
}

export type Pose =
  | 'idle'
  | 'sleep'
  | 'notifyIcon'
export type SpriteMap = Partial<Record<Pose, string>>

export type WorkState = string

export interface TimelineEntry {
  state: WorkState
  startedAt: number
  endedAt: number | null
  keystrokes: number
}

export interface WorkStateSnapshot {
  paused: boolean
  startedToday: boolean
  companionSeconds: number
  durations: Record<WorkState, number>
  state: WorkState
  timeline: TimelineEntry[]
  focusSeconds: number
  keystrokesToday: number
}

export interface NotifyPayload {
  title: string
  message: string
  icon?: string
}
export interface NotifyWindowLayout{placement:'above'|'below'|'left'|'right'|'none';tipLeft:number;tipTop:number}

export interface DiaryEntry {
  text: string
  images: string[]
}


export interface UserSpriteItem { id:string;name:string;tags:string[];url:string }

export type ThemeMode = 'system' | 'light' | 'dark'
export interface CatLayout {
  bubbleOpen: boolean
  petWidth: number
  petHeight: number
  petLeft: number
  petTop: number
  bubbleLeft: number
  bubbleTop: number
  bubbleBelow: boolean
  tipLeft: number
  bubbleScale: number
}
export interface StatusWindowLayout {
  bubbleBelow: boolean
  placement: 'above' | 'below' | 'left' | 'right'
  tipLeft: number
  tipTop: number
  bubbleScale: number
}
export interface SpriteVisualBounds { x:number;y:number;width:number;height:number;anchorX?:number;anchorY?:number }
const api = {
  getCatLayout(): Promise<CatLayout | null> { return ipcRenderer.invoke('cat:get-layout') },
  closeCatBubble(): void { ipcRenderer.send('cat:close-bubble') },
  onCatLayout(callback: (layout: CatLayout) => void): () => void {
    const listener = (_event: unknown, layout: CatLayout): void => callback(layout)
    ipcRenderer.on('cat:layout', listener)
    return () => ipcRenderer.removeListener('cat:layout', listener)
  },
  onStatusLayout(callback: (layout: StatusWindowLayout) => void): () => void {
    const listener = (_event: unknown, layout: StatusWindowLayout): void => callback(layout)
    ipcRenderer.on('status:layout', listener)
    return () => ipcRenderer.removeListener('status:layout', listener)
  },
  getAppearance(): Promise<ThemeMode> { return ipcRenderer.invoke('appearance:get') },
  setAppearance(mode: ThemeMode): Promise<void> { return ipcRenderer.invoke('appearance:set', mode) },
  onAppearanceUpdated(callback: (mode: ThemeMode) => void): () => void {
    const listener = (_event: unknown, mode: ThemeMode): void => callback(mode)
    ipcRenderer.on('appearance:updated', listener)
    return () => ipcRenderer.removeListener('appearance:updated', listener)
  },
  getAccentColor(): Promise<string> { return ipcRenderer.invoke('accent:get') },
  setAccentColor(color: string): Promise<string> { return ipcRenderer.invoke('accent:set', color) },
  onAccentColorUpdated(callback: (color: string) => void): () => void {
    const listener = (_event: unknown, color: string): void => callback(color)
    ipcRenderer.on('accent:updated', listener)
    return () => ipcRenderer.removeListener('accent:updated', listener)
  },
  exportBackup(): Promise<string | null> { return ipcRenderer.invoke('backup:export') },
  importBackup(): Promise<boolean> { return ipcRenderer.invoke('backup:import') },
  onDataImported(callback: () => void): () => void {
    const listener = (): void => callback()
    ipcRenderer.on('data:imported', listener)
    return () => ipcRenderer.removeListener('data:imported', listener)
  },
  pauseRecording(paused: boolean): Promise<void> { return ipcRenderer.invoke('workstate:pause', paused) },
  resetTodayRecording(target: 'all' | 'companion' | 'keystrokes' | WorkState = 'all'): Promise<boolean> { return ipcRenderer.invoke('workstate:reset', target) },
  correctTodayDuration(target:'companion'|WorkState,seconds:number):Promise<void>{return ipcRenderer.invoke('workstate:correct-duration',target,seconds)},
  reportCatDoubleClick(): void { ipcRenderer.send('cat:double-click') },
  dragCat(x: number, y: number): void { ipcRenderer.send('cat:drag', { x, y }) },
  setCatVisualBounds(bounds:SpriteVisualBounds):void{ipcRenderer.send('cat:visual-bounds',bounds)},
  setCatPointerThrough(through:boolean):void{ipcRenderer.send('cat:pointer-through',through)},
  getStats(): Promise<StatsSnapshot> {
    return ipcRenderer.invoke('stats:get')
  },
  closeCurrentWindow(): void {
    ipcRenderer.send('window:close-self')
  },
  getSprites(): Promise<SpriteMap> {
    return ipcRenderer.invoke('sprites:get')
  },
  pickSprite(pose: Pose): Promise<string | null> {
    return ipcRenderer.invoke('sprites:pick', pose)
  },
  pickStaticSprite(): Promise<SpriteMap | null> {
    return ipcRenderer.invoke('sprites:pickStatic')
  },
  resetSprite(pose: Pose): Promise<void> {
    return ipcRenderer.invoke('sprites:reset', pose)
  },
  onSpritesUpdated(callback: (sprites: SpriteMap) => void): () => void {
    const listener = (_event: unknown, sprites: SpriteMap): void => callback(sprites)
    ipcRenderer.on('sprites:updated', listener)
    return () => ipcRenderer.removeListener('sprites:updated', listener)
  },
  getUserSprites():Promise<UserSpriteItem[]> { return ipcRenderer.invoke('sprites:user-list') },
  getUserSpriteTags():Promise<string[]> { return ipcRenderer.invoke('sprites:tag-list') },
  setUserSpriteTags(tags:string[]):Promise<string[]> { return ipcRenderer.invoke('sprites:tag-set',tags) },
  updateUserSprite(id:string,patch:Partial<Pick<UserSpriteItem,'name'|'tags'>>):Promise<UserSpriteItem|null> { return ipcRenderer.invoke('sprites:user-update',id,patch) },
  deleteUserSprite(id:string):Promise<boolean> { return ipcRenderer.invoke('sprites:user-delete',id) },
  applyUserSprite(id:string,target:'cat'|'notify'):Promise<SpriteMap|null> { return ipcRenderer.invoke('sprites:user-apply',id,target) },
  getStartupEnabled():Promise<boolean>{return ipcRenderer.invoke('startup:get')},
  setStartupEnabled(enabled:boolean):Promise<boolean>{return ipcRenderer.invoke('startup:set',enabled)},
  getTodayKey(): Promise<string> {
    return ipcRenderer.invoke('diary:get-today-key')
  },
  getDiaryEntry(date: string): Promise<DiaryEntry> {
    return ipcRenderer.invoke('diary:get', date)
  },
  saveDiaryEntry(date: string, entry: DiaryEntry): Promise<void> {
    return ipcRenderer.invoke('diary:save', date, entry)
  },
  listDiaryDates(): Promise<string[]> {
    return ipcRenderer.invoke('diary:list-dates')
  },
  deleteDiaryEntry(date: string): Promise<void> {
    return ipcRenderer.invoke('diary:delete', date)
  },
  pickDiaryImage(): Promise<string | null> {
    return ipcRenderer.invoke('diary:pick-image')
  },
  getDiaryFont(): Promise<string> {
    return ipcRenderer.invoke('diary:get-font')
  },
  setDiaryFont(font: string): Promise<void> {
    return ipcRenderer.invoke('diary:set-font', font)
  },
  getTaskData(): Promise<TaskData> { return ipcRenderer.invoke('tasks:data') },
  saveTaskList(list: Omit<TaskList, 'id'> & { id?: string }): Promise<TaskList> { return ipcRenderer.invoke('tasks:save-list', list) },
  deleteTaskList(id:string):Promise<void>{return ipcRenderer.invoke('tasks:delete-list',id)},
  updateTask(id: string, patch: TaskPatch): Promise<void> { return ipcRenderer.invoke('tasks:update', id, patch) },
  getTasks(): Promise<TaskItem[]> {
    return ipcRenderer.invoke('tasks:get')
  },
  addTask(text: string, daily: boolean, options?: TaskOptions): Promise<TaskItem> {
    return ipcRenderer.invoke('tasks:add', text, daily, options)
  },
  toggleTask(id: string, date?: string): Promise<TaskItem | null> {
    return ipcRenderer.invoke('tasks:toggle', id, date)
  },
  deleteTask(id: string): Promise<void> {
    return ipcRenderer.invoke('tasks:delete', id)
  },
  getStudyData():Promise<StudyData>{return ipcRenderer.invoke('study:data')},
  saveStudyTask(input:StudyTaskInput,id?:string):Promise<StudyTask>{return ipcRenderer.invoke('study:save',input,id)},
  toggleStudyTask(id:string,date:string):Promise<StudyTask>{return ipcRenderer.invoke('study:toggle',id,date)},
  deleteStudyTask(id:string):Promise<void>{return ipcRenderer.invoke('study:delete',id)},
  setPanelPreference(key: keyof PanelPreferences, value: number): void { ipcRenderer.send('window-settings:set-panel', key, value) },
  onWindowSettingsUpdated(callback: (settings: PanelPreferences & { scale: number; opacity: number }) => void): () => void {
    const listener = (_event: unknown, settings: PanelPreferences & { scale: number; opacity: number }): void => callback(settings)
    ipcRenderer.on('window-settings:updated', listener)
    return () => ipcRenderer.removeListener('window-settings:updated', listener)
  },
  getWindowSettings(): Promise<PanelPreferences & {
    scale: number
    opacity: number
    minScale: number
    maxScale: number
    minOpacity: number
    maxOpacity: number
  }> {
    return ipcRenderer.invoke('window-settings:get')
  },
  setWindowScale(value: number): void {
    ipcRenderer.send('window-settings:set-scale', value)
  },
  setWindowOpacity(value: number): void {
    ipcRenderer.send('window-settings:set-opacity', value)
  },
  getNotificationPreferences(): Promise<NotificationPreferences> { return ipcRenderer.invoke('notifications:get') },
  setNotificationPreferences(value: NotificationPreferences): Promise<NotificationPreferences> { return ipcRenderer.invoke('notifications:set', value) },
  getWorkStates(): Promise<WorkStateDefinition[]> { return ipcRenderer.invoke('workstates:get') },
  setWorkStates(value: WorkStateDefinition[]): Promise<WorkStateDefinition[]> { return ipcRenderer.invoke('workstates:set', value) },
  reportCatClick(): void {
    ipcRenderer.send('cat:click')
  },
  getWorkState(): Promise<WorkStateSnapshot> {
    return ipcRenderer.invoke('workstate:get')
  },
  getWorkStatistics(period:CheckinPeriod,anchorDate:string):Promise<WorkStatistics>{
    return ipcRenderer.invoke('workstate:statistics',period,anchorDate)
  },
  getMusicSnapshot():Promise<MusicSnapshot>{return ipcRenderer.invoke('music:get')},
  setMusicTracking(enabled:boolean):Promise<MusicSnapshot>{return ipcRenderer.invoke('music:set-enabled',enabled)},
  getMusicStatistics(period:CheckinPeriod,anchorDate:string):Promise<MusicStatistics>{return ipcRenderer.invoke('music:statistics',period,anchorDate)},
  onWindowVisibility(callback:(visible:boolean)=>void):()=>void{const listener=(_event:unknown,visible:boolean)=>callback(visible);ipcRenderer.on('window:visibility',listener);return()=>ipcRenderer.removeListener('window:visibility',listener)},
  onMusicUpdated(callback:(snapshot:MusicSnapshot)=>void):()=>void{const listener=(_event:unknown,snapshot:MusicSnapshot)=>callback(snapshot);ipcRenderer.on('music:updated',listener);return()=>ipcRenderer.removeListener('music:updated',listener)},
  switchWorkState(next: WorkState): void {
    ipcRenderer.send('workstate:switch', next)
  },
  onWorkStateUpdated(callback: (state: WorkState) => void): () => void {
    const listener = (_event: unknown, state: WorkState): void => callback(state)
    ipcRenderer.on('workstate:updated', listener)
    return () => ipcRenderer.removeListener('workstate:updated', listener)
  },
  onNotifyShow(callback: (payload: NotifyPayload) => void): () => void {
    const listener = (_event: unknown, payload: NotifyPayload): void => callback(payload)
    ipcRenderer.on('notify:show', listener)
    return () => ipcRenderer.removeListener('notify:show', listener)
  },
  onNotifyLayout(callback:(layout:NotifyWindowLayout)=>void):()=>void{const listener=(_event:unknown,layout:NotifyWindowLayout)=>callback(layout);ipcRenderer.on('notify:layout',listener);return()=>ipcRenderer.removeListener('notify:layout',listener)},
  closeNotify(): void {
    ipcRenderer.send('notify:close')
  },
  openSpriteSettingsWindow(): void {
    ipcRenderer.send('open:sprite-settings')
  },
  openWindowSettingsWindow(): void {
    ipcRenderer.send('open:window-settings')
  },
  openHubDetail(detail:'sprites'|'window'|'notifications'|'states'):Promise<void>{return ipcRenderer.invoke('hub-detail:open',detail)},
  closeHubDetail():void{ipcRenderer.send('hub-detail:close')},
  beginHubDetailClose():void{ipcRenderer.send('hub-detail:begin-close')},
  resizeHubSplit(screenX:number):void{ipcRenderer.send('hub-detail:resize-split',screenX)},
  requestHubDetailClose():void{ipcRenderer.send('hub-detail:request-close')},
  onHubDetailReveal(callback:()=>void):()=>void{
    ipcRenderer.on('hub-detail:reveal',callback)
    return()=>ipcRenderer.removeListener('hub-detail:reveal',callback)
  },
  onHubDetailCloseRequested(callback:()=>void):()=>void{
    ipcRenderer.on('hub-detail:request-close',callback)
    return()=>ipcRenderer.removeListener('hub-detail:request-close',callback)
  },
  onHubDetailState(callback:(direction:'left'|'right'|null)=>void):()=>void{
    const listener=(_event:unknown,direction:'left'|'right'|null):void=>callback(direction)
    ipcRenderer.on('hub-detail:state',listener)
    return()=>ipcRenderer.removeListener('hub-detail:state',listener)
  },
  onHubDetailChanged(callback:(detail:'sprites'|'window'|'notifications'|'states')=>void):()=>void{
    const listener=(_event:unknown,detail:'sprites'|'window'|'notifications'|'states'):void=>callback(detail)
    ipcRenderer.on('hub-detail:set',listener)
    return()=>ipcRenderer.removeListener('hub-detail:set',listener)
  },
  onHubOpenDetail(callback: (detail: 'sprites' | 'window' | 'notifications' | 'states') => void): () => void {
    const listener = (_event: unknown, detail: 'sprites' | 'window' | 'notifications' | 'states'): void => callback(detail)
    ipcRenderer.on('hub:open-detail', listener)
    return () => ipcRenderer.removeListener('hub:open-detail', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
