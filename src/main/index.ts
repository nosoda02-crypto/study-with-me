import type { PanelPreferences } from '../shared/appearance'
import { validNoticeRule, noticeRuleMatches, isKeystrokeMilestone, renderNoticeTemplate, type NotificationPreferences, type NoticeTemplateKey } from '../shared/notifications'
import { validWorkStateDefinition, type WorkStateDefinition } from '../shared/workStates'
import { completedOn, scheduledOn, type TaskOptions, type TaskPatch, type TaskList } from '../shared/tasks'
import type { CheckinPeriod } from '../shared/statistics'
import { exportBackup, importBackup, saveUpdateSafetyBackup } from './backup'
import { app, BrowserWindow, dialog, ipcMain, powerMonitor, nativeTheme } from 'electron'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { extname, join } from 'path'
import { homedir } from 'os'
import {
  createCatWindow,
  createStatusWindow,
  createHubWindow,
  getCatLayout, setCatBubble,
  positionHoverCard,
  positionStatusWindow,
  setPetVisualBounds,
  createHubDetailWindow,
  getHubDetailPlacement,
  positionHubDetailWindow,
  type HubDetailKind,
  type HubExtensionDirection,
  createNotifyWindow,
  positionNotifyWindow,
  applyCatWindowLayout,
  showWindowOnCurrentWorkspace,
  getPetVisibleBounds,
  pointInsideBounds
} from './windows'
import { createTray, TrayHandle } from './tray'
import { startInputListener, stopInputListener } from './inputListener'
import { isStationaryClick } from '../shared/input'
import { recordKeystroke, addRuntimeSeconds, getStats } from './store'
import { flushAllStores } from './cachedStore'
import {
  getTheme, setTheme, ThemeMode, getAccentColor, setAccentColor, getPanelPreferences, setPanelPreference, getNotificationPreferences, setNotificationPreferences, getLastAppVersion, setLastAppVersion, getWorkStates, setWorkStates,
  getWindowScale,
  setWindowScale,
  getWindowOpacity,
  setWindowOpacity,
  MIN_SCALE,
  MAX_SCALE,
  MIN_OPACITY,
  MAX_OPACITY
} from './settingsStore'
import {
  Pose,
  POSES,
  getAllCustomSprites,
  setCustomSprite,
  setStaticSprite,
  resetCustomSprite,
  addUserSprite, listUserSprites, listUserSpriteMeta, getUserSpriteUrl, listUserSpriteTags, setUserSpriteTags, updateUserSprite, applyUserSprite, seedBundledUserSprites
} from './spriteStore'
import {
  getEntry,
  saveEntry,
  listDates,
  deleteEntry,
  todayStr,
  DiaryEntry,
  getFont,
  setFont,
  migrateDiaryImages
} from './diaryStore'
import { getTaskData, saveTaskList, deleteTaskList, updateTask, getTasks, addTask, toggleTask, deleteTask } from './tasksStore'
import { getStudyData,saveStudyTask,toggleStudyTask,deleteStudyTask } from './studyStore'
import { studyCompletedOn,studyScheduledOn,type StudyTaskInput } from '../shared/study'
import { flushMusic,getMusicSnapshot,getMusicStatistics,sampleMusic,setMusicTracking } from './musicStore'
import {
  WorkState, ResetTarget,
  getCurrentState,
  switchState,
  recordSegmentKeystroke,
  getFocusSecondsToday,
  getKeystrokesToday, getWorkSnapshot, getWorkStatistics, isRecording, setRecordingPaused, resetTodayRecording, correctTodayDuration,
  checkpointWorkState, suspendRecording
} from './workStateStore'

// Only one instance of the cat should run at a time.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

let catWindow: BrowserWindow | null = null
let statusWindow: BrowserWindow | null = null
let hubWindow: BrowserWindow | null = null
let hubDetailWindow:BrowserWindow|null=null
let hubDetailDirection:HubExtensionDirection='right'
let syncingHubPair=false
let notifyWindow: BrowserWindow | null = null
let suppressCatClickUntil=0

app.on('second-instance',()=>{
  if(!catWindow||catWindow.isDestroyed())return
  showWindowOnCurrentWorkspace(catWindow)
  trayHandle?.refresh()
})

const DEV_LOGIN_AGENT='com.studywithme.app.dev'
function devLoginAgentPath():string{return join(homedir(),'Library','LaunchAgents',`${DEV_LOGIN_AGENT}.plist`)}
function xmlValue(value:string):string{return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}
function getStartupEnabled():boolean{
  if(process.platform==='darwin'&&!app.isPackaged)return existsSync(devLoginAgentPath())
  const settings=app.getLoginItemSettings()
  return settings.openAtLogin||settings.status==='enabled'||settings.status==='requires-approval'
}
function setStartupEnabled(enabled:boolean):boolean{
  if(process.platform==='darwin'&&!app.isPackaged){
    const file=devLoginAgentPath()
    if(enabled){
      mkdirSync(join(homedir(),'Library','LaunchAgents'),{recursive:true})
      const project=app.getAppPath()
      const electron=join(project,'node_modules','electron','dist','Electron.app','Contents','MacOS','Electron')
      const log=join(project,'.study-with-me-login.log')
      writeFileSync(file,`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${DEV_LOGIN_AGENT}</string><key>ProgramArguments</key><array><string>${xmlValue(electron)}</string><string>${xmlValue(project)}</string></array><key>RunAtLoad</key><true/><key>ProcessType</key><string>Interactive</string><key>StandardOutPath</key><string>${xmlValue(log)}</string><key>StandardErrorPath</key><string>${xmlValue(log)}</string></dict></plist>\n`)
    }else if(existsSync(file))unlinkSync(file)
  }else app.setLoginItemSettings({openAtLogin:enabled})
  return getStartupEnabled()
}
let trayHandle: TrayHandle | null = null
let clickThrough = false
let keyTrackingActive = false
let windowScale = getWindowScale()
let windowOpacity = getWindowOpacity()
let sessionSeconds = 0
let pendingSeconds = 0
let lastTick = Date.now()
let stateBeforeSystemPause:WorkState|null=null
let pendingOutsideStatusClick:{x:number;y:number}|null=null
function captureRuntime(): void {
  const now = Date.now()
  if (isRecording()) {
    const seconds = Math.max(0, now - lastTick) / 1000
    sessionSeconds += seconds
    pendingSeconds += seconds
  }
  lastTick = now
}
function flushRuntime(): void {
  captureRuntime()
  addRuntimeSeconds(pendingSeconds)
  pendingSeconds = 0
  checkpointWorkState()
}

interface NotifyPayload {
  title: string
  message: string
  kind?: NoticeTemplateKey
  iconSpriteId?: string
}

const notifyQueue: NotifyPayload[] = []
let notifyDismissTimer: NodeJS.Timeout | null = null
const notificationRunKeys = new Set<string>()
const stateLabel = (id:WorkState):string => getWorkStates().find(s=>s.id===id)?.label ?? id

function broadcastSprites(): void {
  const sprites = getAllCustomSprites()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('sprites:updated', sprites)
  }
}

function sessionRuntimeSeconds(): number {
  captureRuntime()
  return sessionSeconds
}

function setClickThrough(enabled: boolean): void {
  clickThrough = enabled
  catWindow?.setIgnoreMouseEvents(enabled, { forward: true })
}

function toggleVisible(): void {
  if (!catWindow) return
  if (catWindow.isVisible()) {
    catWindow.hide()
    hideHoverCard()
  } else {
    showWindowOnCurrentWorkspace(catWindow)
  }
}

function applyWindowScale(value: number): void {
  if (!catWindow || !Number.isFinite(value)) return
  windowScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
  setWindowScale(windowScale)
  applyCatWindowLayout(catWindow, windowScale)
  broadcastWindowSettings()
}

function applyWindowOpacity(value: number): void {
  if (!catWindow || !Number.isFinite(value)) return
  windowOpacity = Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, value))
  setWindowOpacity(windowOpacity)
  broadcastWindowSettings()
}

function windowSettingsSnapshot() {
  return { scale: windowScale, opacity: windowOpacity, minScale: MIN_SCALE, maxScale: MAX_SCALE,
    minOpacity: MIN_OPACITY, maxOpacity: MAX_OPACITY, ...getPanelPreferences() }
}
function broadcastWindowSettings(): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('window-settings:updated', windowSettingsSnapshot())
}
function applyPanelPreferences(): void {
  const preferences = getPanelPreferences()
  if(hubWindow&&!hubWindow.isDestroyed())hubWindow.setOpacity(preferences.hubOpacity)
  if(hubDetailWindow&&!hubDetailWindow.isDestroyed())hubDetailWindow.setOpacity(preferences.hubOpacity)
  if(notifyWindow&&!notifyWindow.isDestroyed())notifyWindow.setOpacity(preferences.notificationOpacity)
  // The single-click bubble applies opacity in CSS so the transparent host is
  // not multiplied by a second native opacity layer.
  if(statusWindow&&!statusWindow.isDestroyed())statusWindow.setOpacity(1)
  if (catWindow) {
    if (statusWindow && !statusWindow.isDestroyed()) positionStatusWindow(statusWindow, catWindow)
    if(notifyWindow&&!notifyWindow.isDestroyed()&&notifyWindow.isVisible())positionNotifyWindow(notifyWindow,catWindow,getNotificationPreferences().location,statusWindow?.isVisible()?statusWindow:null)
    if (hubWindow) positionHoverCard(hubWindow,catWindow)
    if(hubDetailWindow&&hubWindow)positionHubDetailWindow(hubDetailWindow,hubWindow,hubDetailDirection)
  }
  broadcastWindowSettings()
}

function showHoverCard(): void {
  if (!catWindow) return
  if (statusWindow && !statusWindow.isDestroyed()) {
    positionStatusWindow(statusWindow, catWindow)
    showWindowOnCurrentWorkspace(statusWindow,true)
    if(notifyWindow&&!notifyWindow.isDestroyed()&&notifyWindow.isVisible()){
      positionNotifyWindow(notifyWindow,catWindow,getNotificationPreferences().location,statusWindow)
      notifyWindow.moveTop()
    }
    return
  }
  statusWindow = createStatusWindow(catWindow)
  statusWindow.webContents.once('did-finish-load', () => {
    if (!statusWindow || statusWindow.isDestroyed() || !catWindow) return
    const parentWindow=catWindow
    positionStatusWindow(statusWindow, parentWindow)
    void statusWindow.webContents.executeJavaScript(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`).then(() => {
      if (statusWindow && !statusWindow.isDestroyed()) showWindowOnCurrentWorkspace(statusWindow,true)
      if(statusWindow&&notifyWindow&&!notifyWindow.isDestroyed()&&notifyWindow.isVisible()){
        positionNotifyWindow(notifyWindow,parentWindow,getNotificationPreferences().location,statusWindow)
        notifyWindow.moveTop()
      }
    })
  })
  statusWindow.on('closed', () => { statusWindow = null })
}
function hideHoverCard(): void {
  statusWindow?.hide()
  if(catWindow&&notifyWindow&&!notifyWindow.isDestroyed()&&notifyWindow.isVisible())positionNotifyWindow(notifyWindow,catWindow,getNotificationPreferences().location)
}

function closeNotify(): void {
  if (notifyDismissTimer) {
    clearTimeout(notifyDismissTimer)
    notifyDismissTimer = null
  }
  notifyWindow?.hide()

  const next = notifyQueue.shift()
  if (next) showNotify(next)
}

function showNotify(payload: NotifyPayload): void {
  if (!catWindow) return

  if (notifyWindow && !notifyWindow.isDestroyed() && notifyWindow.isVisible()) {
    notifyQueue.push(payload)
    return
  }

  const deliver = (): void => {
    if (!notifyWindow || notifyWindow.isDestroyed()) return
    const preferences=getNotificationPreferences()
    const library=listUserSpriteMeta()
    const fixedId=payload.iconSpriteId||(payload.kind?preferences.templateIcons[payload.kind]:'')
    const fixed=fixedId?library.find(item=>item.id===fixedId):undefined
    // Multiple selected tags narrow the pool to their intersection.
    const pool=library.filter(item=>preferences.randomIconTags.length>0&&preferences.randomIconTags.every(tag=>item.tags.includes(tag)))
    const random=pool.length?pool[Math.floor(Math.random()*pool.length)]:undefined
    const iconId=(fixed??random)?.id
    notifyWindow.webContents.send('notify:show', { title:preferences.petName,message:payload.message,icon:iconId?getUserSpriteUrl(iconId):undefined })
    if (catWindow) positionNotifyWindow(notifyWindow, catWindow, preferences.location, statusWindow?.isVisible()?statusWindow:null)
    showWindowOnCurrentWorkspace(notifyWindow,true)

    if (notifyDismissTimer) clearTimeout(notifyDismissTimer)
    notifyDismissTimer = setTimeout(closeNotify, preferences.displaySeconds*1000)
  }

  if (!notifyWindow || notifyWindow.isDestroyed()) {
    // A freshly created window's renderer hasn't loaded yet - sending the
    // IPC message immediately would drop it on the floor (no listener
    // attached yet), leaving the card permanently blank.
    notifyWindow = createNotifyWindow(catWindow)
    notifyWindow.setOpacity(getPanelPreferences().notificationOpacity)
    notifyWindow.webContents.once('did-finish-load', deliver)
  } else {
    deliver()
  }
}

function checkTimedNotifications(now = new Date()): void {
  const preferences = getNotificationPreferences()
  const date = todayStr(now)
  const hh = String(now.getHours()).padStart(2, '0')
  const emitOnce = (key: string, payload: NotifyPayload): void => {
    if (notificationRunKeys.has(key)) return
    notificationRunKeys.add(key); showNotify(payload)
    if (notificationRunKeys.size > 500) for (const old of [...notificationRunKeys].slice(0, 250)) notificationRunKeys.delete(old)
  }
  const minute=`${hh}:${String(now.getMinutes()).padStart(2,'0')}`,scanKey=`scan:${date}:${minute}`
  if(!notificationRunKeys.has(scanKey)){
    notificationRunKeys.add(scanKey)
    if(notificationRunKeys.size>500)for(const old of [...notificationRunKeys].slice(0,250))notificationRunKeys.delete(old)
    if (preferences.hourlyEnabled && now.getMinutes() === 0) emitOnce(`clock:${date}:${hh}`, { title: preferences.petName,kind:'hourly', message: renderNoticeTemplate(preferences.templates.hourly,{time:`${hh}:00`}) })
    for (const rule of preferences.customRules) if (noticeRuleMatches(rule, now)) emitOnce(`rule:${rule.id}:${date}`, { title: preferences.petName, message: rule.message,iconSpriteId:rule.iconSpriteId })
    for(const task of getTaskData().items){
      const taskDate=task.daily?date:task.dueDate
      if(task.dueTime && taskDate===date && scheduledOn(task,date) && task.dueTime===minute && !completedOn(task,date)) emitOnce(`task:${task.id}:${date}`,{title:preferences.petName,kind:'taskDue',message:renderNoticeTemplate(preferences.templates.taskDue,{task:task.text})})
    }
    for(const task of getStudyData().items){
      if(task.reminderTime===minute&&studyScheduledOn(task,date)&&!studyCompletedOn(task,date))emitOnce(`study:${task.id}:${date}`,{title:preferences.petName,kind:'taskDue',message:renderNoticeTemplate(preferences.templates.taskDue,{task:task.title})})
    }
  }
  if (preferences.stateHourlyEnabled && isRecording()) {
    const snapshot = getWorkSnapshot()
    const current = snapshot.timeline.at(-1)
    if (current?.endedAt === null) {
      const hours = Math.floor((now.getTime() - current.startedAt) / 3_600_000)
      if (hours > 0) emitOnce(`state:${current.startedAt}:${hours}`, { title: preferences.petName,kind:'stateHourly', message: renderNoticeTemplate(preferences.templates.stateHourly,{state:stateLabel(current.state),hours}) })
    }
  }
}

function checkKeystrokeMilestone(): void {
  const preferences = getNotificationPreferences()
  const count = getKeystrokesToday()
  if (isKeystrokeMilestone(count, preferences)) showNotify({ title: preferences.petName,kind:'keystroke', message: renderNoticeTemplate(preferences.templates.keystroke,{count:count.toLocaleString()}) })
}

function broadcastWorkState(state: WorkState): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('workstate:updated', state)
}

function handleWorkStateSwitch(next: WorkState): void {
  if (!getWorkStates().some(s=>s.id===next)) return
  const before=getWorkSnapshot()
  if(before.startedToday&&getCurrentState()===next)return
  switchState(next)
  broadcastWorkState(next)

  if (next === 'off') {
    const hours = (getFocusSecondsToday() / 3600).toFixed(1)
    const keystrokes = getKeystrokesToday()
    showNotify({
      title: getNotificationPreferences().petName,
      kind:'off',
      message: renderNoticeTemplate(getNotificationPreferences().templates.off,{hours,count:keystrokes.toLocaleString()})
    })
  } else {const preferences=getNotificationPreferences();showNotify({title:preferences.petName,kind:'stateSwitch',message:renderNoticeTemplate(preferences.templates.stateSwitch,{state:stateLabel(next)})})}
}

function openHub(detail?: 'sprites' | 'window' | 'notifications' | 'states'): void {
  hideHoverCard()
  if (hubWindow && !hubWindow.isDestroyed()) {
    if (catWindow) positionHoverCard(hubWindow, catWindow)
    showWindowOnCurrentWorkspace(hubWindow)
    hubWindow.focus()
    if (detail) hubWindow.webContents.send('hub:open-detail', detail)
    return
  }
  if (!catWindow) return
  hubWindow = createHubWindow(catWindow)
  hubWindow.setOpacity(getPanelPreferences().hubOpacity)
  hubWindow.on('closed', () => {
    hubDetailWindow?.close()
    hubDetailWindow=null
    hubWindow = null
  })
  hubWindow.on('resize',()=>{
    if(syncingHubPair||!hubWindow||!hubDetailWindow||hubDetailWindow.isDestroyed())return
    syncingHubPair=true
    positionHubDetailWindow(hubDetailWindow,hubWindow,hubDetailDirection)
    syncingHubPair=false
  })
  if (detail) hubWindow.webContents.once('did-finish-load', () => hubWindow?.webContents.send('hub:open-detail', detail))
}

function openHubDetail(detail:HubDetailKind):void{
  if(!hubWindow||hubWindow.isDestroyed())return
  if(hubDetailWindow&&!hubDetailWindow.isDestroyed()){
    positionHubDetailWindow(hubDetailWindow,hubWindow,hubDetailDirection)
    hubDetailWindow.webContents.send('hub-detail:set',detail)
    showWindowOnCurrentWorkspace(hubDetailWindow,true)
    return
  }
  const placement=getHubDetailPlacement(hubWindow)
  hubDetailDirection=placement.direction
  hubDetailWindow=createHubDetailWindow(hubWindow,detail,placement.direction,placement.bounds)
  hubDetailWindow.setOpacity(getPanelPreferences().hubOpacity)
  hubDetailWindow.on('resize',()=>{
    if(syncingHubPair||!hubWindow||!hubDetailWindow)return
    syncingHubPair=true
    const detailBounds=hubDetailWindow.getBounds(),hubBounds=hubWindow.getBounds()
    const x=hubDetailDirection==='left'?detailBounds.x+detailBounds.width:hubBounds.x
    hubWindow.setBounds({...hubBounds,x,y:detailBounds.y,height:detailBounds.height},false)
    positionHubDetailWindow(hubDetailWindow,hubWindow,hubDetailDirection)
    syncingHubPair=false
  })
  hubDetailWindow.on('closed',()=>{hubWindow?.webContents.send('hub-detail:state',null);hubDetailWindow=null})
}

function openSpriteSettings(): void {
  openHub('sprites')
}

function openWindowSettings(): void {
  openHub('window')
}

function syncAppearance(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('appearance:updated', getTheme())
    win.webContents.send('accent:updated', getAccentColor())
  }
  const color = nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f5f6f9'
}
app.whenReady().then(() => {
  const currentVersion = app.getVersion()
  const previousVersion = getLastAppVersion()
  if (previousVersion && previousVersion !== currentVersion) saveUpdateSafetyBackup(previousVersion, currentVersion)
  setLastAppVersion(currentVersion)
  migrateDiaryImages()
  const seeded=seedBundledUserSprites()
  if(seeded.added&&seeded.randomIconTags.length){
    const preferences=getNotificationPreferences()
    setNotificationPreferences({...preferences,randomIconTags:[...new Set([...preferences.randomIconTags,...seeded.randomIconTags])]})
  }
  nativeTheme.themeSource = getTheme()
  nativeTheme.on('updated', syncAppearance)
  catWindow = createCatWindow(windowScale, windowOpacity)

  const attemptStartKeyTracking = (): void => {
    keyTrackingActive = startInputListener({
      onKeydown: () => {
        if (isRecording()) { recordKeystroke(); recordSegmentKeystroke(); checkKeystrokeMilestone() }
      },
      onMouseDown: event => {
        pendingOutsideStatusClick=null
        if(!statusWindow||statusWindow.isDestroyed()||!statusWindow.isVisible())return
        const point={x:event.x,y:event.y}
        if(pointInsideBounds(point,statusWindow.getBounds()))return
        if(catWindow&&!catWindow.isDestroyed()&&pointInsideBounds(point,getPetVisibleBounds(catWindow)))suppressCatClickUntil=Date.now()+600
        // Wait for mouse-up before dismissing. A screenshot area selection is
        // a drag beginning outside the card, whereas an ordinary dismissal is
        // a stationary click. This also covers WeChat/QQ capture overlays when
        // their shortcut never reaches our keyboard hook.
        pendingOutsideStatusClick=point
      },
      onMouseUp: event => {
        const start=pendingOutsideStatusClick
        pendingOutsideStatusClick=null
        if(start&&statusWindow&&!statusWindow.isDestroyed()&&statusWindow.isVisible()){
          if(isStationaryClick(start,event))hideHoverCard()
        }
      }
    })
  }

  trayHandle = createTray({
    isVisible: () => catWindow?.isVisible() ?? false,
    isClickThrough: () => clickThrough,
    isKeyTrackingActive: () => keyTrackingActive,
    toggleVisible,
    toggleClickThrough: () => setClickThrough(!clickThrough),
    openStatus: () => { hubDetailWindow?.close();hubWindow?.hide(); showHoverCard() },
    openHub,
    openSpriteSettings,
    openWindowSettings,
    retryKeyTracking: attemptStartKeyTracking
  })

  catWindow.on('show', () => trayHandle?.refresh())
  catWindow.on('hide', () => trayHandle?.refresh())

  attemptStartKeyTracking()
  trayHandle.refresh()

  const reposition = (): void => {
    if (!catWindow) return
    if(hubWindow&&!hubWindow.isDestroyed())positionHoverCard(hubWindow,catWindow)
    if(hubDetailWindow&&hubWindow&&!hubDetailWindow.isDestroyed())positionHubDetailWindow(hubDetailWindow,hubWindow,hubDetailDirection)
    if (statusWindow && !statusWindow.isDestroyed() && statusWindow.isVisible()) positionStatusWindow(statusWindow, catWindow)
    if (notifyWindow && !notifyWindow.isDestroyed() && notifyWindow.isVisible()) positionNotifyWindow(notifyWindow, catWindow, getNotificationPreferences().location, statusWindow?.isVisible()?statusWindow:null)
  }
  catWindow.on('move', reposition)
  catWindow.on('resize', reposition)
  const flushInterval = setInterval(flushRuntime, 30_000)
  const musicInterval=setInterval(()=>{void sampleMusic().then(snapshot=>{for(const win of BrowserWindow.getAllWindows())win.webContents.send('music:updated',snapshot)})},5000)
  void sampleMusic()
  // Explicit switches broadcast themselves; the tick only reports changes it
  // detects (day rollover, wake restore). Panels keep their own timers for live
  // durations, so a per-second broadcast only made the statistics panel reload.
  let tickState=getCurrentState()
  const tickInterval = setInterval(() => {
    captureRuntime()
    const state=getCurrentState()
    if(state!==tickState){tickState=state;broadcastWorkState(state)}
    checkTimedNotifications()
  }, 1000)
  // Keep wall-clock recording through display sleep/system sleep. Remember the
  // selected state explicitly so a renderer or OS wake cycle can never fall
  // back to the default "focus" state.
  const rememberSystemState=():void=>{
    flushRuntime()
    stateBeforeSystemPause??=getCurrentState()
  }
  const restoreSystemState=():void=>{
    flushRuntime()
    const remembered=stateBeforeSystemPause
    stateBeforeSystemPause=null
    const snapshot=getWorkSnapshot()
    // A new calendar day still waits for the user's first explicit state
    // choice. Wake restoration may only repair an already-started same-day session.
    if(remembered&&snapshot.startedToday&&snapshot.state!==remembered)switchState(remembered)
    broadcastWorkState(getCurrentState())
  }
  powerMonitor.on('suspend',rememberSystemState)
  powerMonitor.on('lock-screen',rememberSystemState)
  powerMonitor.on('resume',restoreSystemState)
  powerMonitor.on('unlock-screen',restoreSystemState)
  app.on('will-quit', () => {
    clearInterval(flushInterval); clearInterval(tickInterval);clearInterval(musicInterval)
    flushRuntime();flushMusic(); suspendRecording(); stopInputListener(); flushAllStores()
  })
})

// Tell each renderer when its window is shown/hidden so hidden panels can stop polling.
app.on('browser-window-created',(_event,win)=>{
  const report=(visible:boolean)=>{if(!win.webContents.isDestroyed())win.webContents.send('window:visibility',visible)}
  win.on('show',()=>report(true));win.on('hide',()=>report(false))
})

ipcMain.on('cat:click', () => {
  if(Date.now()<suppressCatClickUntil){suppressCatClickUntil=0;return}
  if (statusWindow && !statusWindow.isDestroyed() && statusWindow.isVisible()) hideHoverCard()
  else { hubWindow?.hide(); showHoverCard() }
})
ipcMain.handle('cat:get-layout', () => catWindow ? getCatLayout(catWindow) : null)
ipcMain.on('cat:close-bubble', () => hideHoverCard())
ipcMain.on('cat:double-click', () => openHub())
ipcMain.on('cat:drag', (event, delta: { x: number; y: number }) => {
  if (event.sender !== catWindow?.webContents || !Number.isFinite(delta?.x) || !Number.isFinite(delta?.y)) return
  const [x, y] = catWindow.getPosition()
  catWindow.setPosition(Math.round(x + delta.x), Math.round(y + delta.y))
})
ipcMain.on('cat:visual-bounds',(event,bounds:{x:number;y:number;width:number;height:number;anchorX?:number;anchorY?:number})=>{
  if(!catWindow||event.sender!==catWindow.webContents||!bounds||![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite)||([bounds.anchorX,bounds.anchorY].some(value=>value!==undefined&&!Number.isFinite(value))))return
  setPetVisualBounds(catWindow,bounds)
  if(statusWindow?.isVisible())positionStatusWindow(statusWindow,catWindow)
})
ipcMain.on('cat:pointer-through',(event,through:boolean)=>{
  if(!catWindow||event.sender!==catWindow.webContents||clickThrough||typeof through!=='boolean')return
  catWindow.setIgnoreMouseEvents(through,{forward:true})
})

ipcMain.handle('stats:get', () => {
  const snapshot = getStats(sessionRuntimeSeconds())
  return { ...snapshot, totalRuntimeSeconds: snapshot.totalRuntimeSeconds + Math.round(pendingSeconds) }
})

ipcMain.handle('startup:get',()=>getStartupEnabled())
ipcMain.handle('startup:set',(_event,enabled:boolean)=>{if(typeof enabled!=='boolean')throw new Error('开机启动设置无效');return setStartupEnabled(enabled)})
ipcMain.handle('appearance:get', () => getTheme())
ipcMain.handle('appearance:set', (_event, mode: ThemeMode) => {
  if (!['system', 'light', 'dark'].includes(mode)) return
  setTheme(mode); nativeTheme.themeSource = mode; syncAppearance()
})
ipcMain.handle('accent:get', () => getAccentColor())
ipcMain.handle('accent:set', (_event, color: string) => {
  const value=setAccentColor(color)
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('accent:updated', value)
  return value
})

ipcMain.handle('sprites:get', () => getAllCustomSprites())

async function pickImageFile(win: BrowserWindow | null): Promise<string | null> {
  const dialogOptions: Electron.OpenDialogOptions = {
    title: '选择贴图图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
  }
  const result = win
    ? await dialog.showOpenDialog(win, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions)

  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

ipcMain.handle('sprites:pick', async (event, pose: Pose) => {
  if (!POSES.includes(pose)) return null

  const filePath = await pickImageFile(BrowserWindow.fromWebContents(event.sender))
  if (!filePath) return null

  const dataUrl = setCustomSprite(pose, filePath)
  addUserSprite(filePath)
  broadcastSprites()
  return dataUrl
})

ipcMain.handle('sprites:pickStatic', async (event) => {
  const filePath = await pickImageFile(BrowserWindow.fromWebContents(event.sender))
  if (!filePath) return null

  const sprites = setStaticSprite(filePath)
  addUserSprite(filePath)
  broadcastSprites()
  return sprites
})

ipcMain.handle('sprites:reset', (_event, pose: Pose) => {
  if (!POSES.includes(pose)) return
  resetCustomSprite(pose)
  broadcastSprites()
})

ipcMain.handle('sprites:user-list', () => listUserSprites())
ipcMain.handle('sprites:tag-list', () => listUserSpriteTags())
ipcMain.handle('sprites:tag-set', (_event,tags:string[]) => setUserSpriteTags(tags))
ipcMain.handle('sprites:user-update', (_event,id:string,patch:{name?:string;tags?:string[]}) => updateUserSprite(id,patch))
ipcMain.handle('sprites:user-apply', (_event,id:string,target:'cat'|'notify') => {
  const sprites=applyUserSprite(id,target);if(sprites)broadcastSprites();return sprites
})

ipcMain.handle('diary:get-today-key', () => todayStr())

ipcMain.handle('diary:get', (_event, date: string) => getEntry(date))

ipcMain.handle('diary:save', (_event, date: string, entry: DiaryEntry) => saveEntry(date, entry))

ipcMain.handle('diary:list-dates', () => listDates())

ipcMain.handle('diary:delete', (_event, date: string) => deleteEntry(date))

ipcMain.handle('diary:get-font', () => getFont())

ipcMain.handle('diary:set-font', (_event, font: string) => setFont(font))

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

ipcMain.handle('diary:pick-image', async (event) => {
  const filePath = await pickImageFile(BrowserWindow.fromWebContents(event.sender))
  if (!filePath) return null

  const mime = IMAGE_MIME_BY_EXT[extname(filePath).toLowerCase()] ?? 'image/png'
  const buffer = readFileSync(filePath)
  return `data:${mime};base64,${buffer.toString('base64')}`
})

ipcMain.handle('tasks:data', () => getTaskData())
ipcMain.handle('tasks:save-list', (_event, list: Omit<TaskList, 'id'> & { id?: string }) => saveTaskList(list))
ipcMain.handle('tasks:delete-list',(_event,id:string)=>deleteTaskList(id))
ipcMain.handle('tasks:update', (_event, id: string, patch: TaskPatch) => updateTask(id, patch))

ipcMain.handle('tasks:get', () => getTasks())

ipcMain.handle('tasks:add', (_event, text: string, daily: boolean, options?: TaskOptions) => addTask(text, daily, options))

ipcMain.handle('tasks:toggle', (_event, id: string, date?: string) => {
  const updated = toggleTask(id, date)
  if (updated && completedOn(updated, date ?? todayStr())) {
    const preferences=getNotificationPreferences();showNotify({ title: preferences.petName,kind:'taskComplete', message: renderNoticeTemplate(preferences.templates.taskComplete,{task:updated.text}) })
  }
  return updated
})

ipcMain.handle('tasks:delete', (_event, id: string) => deleteTask(id))
ipcMain.handle('study:data',()=>getStudyData())
ipcMain.handle('study:save',(_event,input:StudyTaskInput,id?:string)=>saveStudyTask(input,id))
ipcMain.handle('study:toggle',(_event,id:string,date:string)=>{
  const updated=toggleStudyTask(id,date)
  if(studyCompletedOn(updated,date)){const preferences=getNotificationPreferences();showNotify({title:preferences.petName,kind:'taskComplete',message:renderNoticeTemplate(preferences.templates.taskComplete,{task:updated.title})})}
  return updated
})
ipcMain.handle('study:delete',(_event,id:string)=>deleteStudyTask(id))

ipcMain.handle('window-settings:get', () => windowSettingsSnapshot())
ipcMain.on('window-settings:set-panel', (_event, key: keyof PanelPreferences, value: number) => {
  setPanelPreference(key, value); applyPanelPreferences()
})

ipcMain.on('window-settings:set-scale', (_event, value: number) => applyWindowScale(value))

ipcMain.on('window-settings:set-opacity', (_event, value: number) => applyWindowOpacity(value))

ipcMain.handle('notifications:get', () => getNotificationPreferences())
ipcMain.handle('notifications:set', (_event, value: NotificationPreferences) => {
  if (!value || typeof value.petName!=='string'||!value.petName.trim()||!value.templates||!value.templateIcons||!['hourly','stateSwitch','stateHourly','keystroke','taskDue','taskComplete','off'].every(k=>typeof value.templates[k as keyof typeof value.templates]==='string'&&typeof value.templateIcons[k as keyof typeof value.templateIcons]==='string')||!Array.isArray(value.randomIconTags)||!value.randomIconTags.every(tag=>typeof tag==='string'&&tag.trim().length>0)||!['pet', 'top-right'].includes(value.location)||!Number.isFinite(value.displaySeconds)||value.displaySeconds<2||value.displaySeconds>30 || typeof value.hourlyEnabled !== 'boolean' || typeof value.stateHourlyEnabled !== 'boolean' || typeof value.keystrokeEnabled !== 'boolean' || !Number.isFinite(value.keystrokeStep) || value.keystrokeStep < 100 || !Array.isArray(value.customRules) || !value.customRules.every(validNoticeRule)) throw new Error('提醒设置无效')
  const saved = setNotificationPreferences(value)
  if (notifyWindow && catWindow && notifyWindow.isVisible()) positionNotifyWindow(notifyWindow, catWindow, saved.location, statusWindow?.isVisible()?statusWindow:null)
  return saved
})
ipcMain.handle('workstates:get',()=>getWorkStates())
ipcMain.handle('workstates:set',(_event,value:WorkStateDefinition[])=>{
  if(!Array.isArray(value)||!value.length||!value.every(validWorkStateDefinition)||!value.some(s=>s.id===getCurrentState())) throw new Error('状态设置无效')
  const saved=setWorkStates(value)
  for(const win of BrowserWindow.getAllWindows())win.webContents.send('workstate:updated',getCurrentState())
  return saved
})

ipcMain.handle('workstate:get', () => getWorkSnapshot())
ipcMain.handle('workstate:statistics',(_event,period:CheckinPeriod,anchorDate:string)=>{
  if(!['week','month','year'].includes(period)||typeof anchorDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate))throw new Error('统计周期无效')
  return getWorkStatistics(period,anchorDate)
})
ipcMain.handle('music:get',()=>getMusicSnapshot())
ipcMain.handle('music:set-enabled',async(_event,enabled:boolean)=>{
  if(typeof enabled!=='boolean')throw new Error('听歌统计设置无效')
  setMusicTracking(enabled)
  const snapshot=enabled?await sampleMusic():getMusicSnapshot()
  for(const win of BrowserWindow.getAllWindows())win.webContents.send('music:updated',snapshot)
  return snapshot
})
ipcMain.handle('music:statistics',(_event,period:CheckinPeriod,anchorDate:string)=>{
  if(!['week','month','year'].includes(period)||typeof anchorDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate))throw new Error('统计周期无效')
  return getMusicStatistics(period,anchorDate)
})
ipcMain.handle('workstate:pause', (_event, paused: boolean) => {
  if (typeof paused !== 'boolean') return
  flushRuntime(); setRecordingPaused(paused)
  broadcastWorkState(getCurrentState())
})
ipcMain.handle('workstate:reset', async (event, target: ResetTarget = 'all') => {
  const special:Record<string,string>={all:'今日全部状态记录',companion:'今日陪伴时长',keystrokes:'今日按键数'}
  if (!(target in special) && !getWorkStates().some(s=>s.id===target)) return false
  const label=special[target]??`${stateLabel(target)}时长`
  const parent = BrowserWindow.fromWebContents(event.sender)
  if (!parent) return false
  const { response } = await dialog.showMessageBox(parent, {
    type: 'warning', message: `重置${label}？`,
    detail: target === 'all' ? '清除今日各状态时长、时间轴和状态按键计数。历史记录、累计统计、任务和日记不受影响。' : '只重置所选统计，其他时长、按键数、历史记录、任务和日记保持不变。',
    buttons: ['取消', '确认重置'], defaultId: 0, cancelId: 0
  })
  if (response !== 1) return false
  resetTodayRecording(target)
  broadcastWorkState(getCurrentState())
  return true
})
ipcMain.handle('workstate:correct-duration',(_event,target:'companion'|WorkState,seconds:number)=>{
  if(target!=='companion'&&!getWorkStates().some(state=>state.id===target))throw new Error('状态不存在')
  correctTodayDuration(target,seconds)
  broadcastWorkState(getCurrentState())
})
ipcMain.handle('backup:export', async (event) => {
  const parent = BrowserWindow.fromWebContents(event.sender)
  if (!parent) return null
  flushRuntime()
  return exportBackup(parent, flushRuntime)
})
ipcMain.handle('backup:import', async (event) => {
  const parent = BrowserWindow.fromWebContents(event.sender)
  if (!parent) return false
  flushRuntime()
  const imported = await importBackup(parent, flushRuntime)
  if (imported) {
    pendingSeconds = 0; sessionSeconds = 0; lastTick = Date.now()
    nativeTheme.themeSource = getTheme(); syncAppearance()
    applyWindowScale(getWindowScale()); applyWindowOpacity(getWindowOpacity()); applyPanelPreferences()
    broadcastSprites(); broadcastWorkState(getCurrentState()); trayHandle?.refresh()
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('data:imported')
  }
  return imported
})

ipcMain.on('workstate:switch', (_event, next: WorkState) => handleWorkStateSwitch(next))

ipcMain.on('notify:close', () => closeNotify())

ipcMain.on('open:sprite-settings', () => openSpriteSettings())

ipcMain.on('open:window-settings', () => openWindowSettings())

ipcMain.handle('hub-detail:open',(event,detail:HubDetailKind)=>{
  if(!hubWindow||event.sender!==hubWindow.webContents)return
  openHubDetail(detail)
})
ipcMain.on('hub-detail:close',event=>{
  if(!hubDetailWindow||event.sender!==hubDetailWindow.webContents)return
  hubDetailWindow.close()
})
ipcMain.on('hub-detail:begin-close',event=>{
  if(!hubDetailWindow||event.sender!==hubDetailWindow.webContents)return
  hubWindow?.webContents.send('hub-detail:state',null)
})
ipcMain.on('hub-detail:resize-split',(event,screenX:number)=>{
  if(event.sender!==hubDetailWindow?.webContents||!hubWindow||!Number.isFinite(screenX))return
  const hub=hubWindow.getBounds(),detail=hubDetailWindow.getBounds()
  const left=Math.min(hub.x,detail.x),right=Math.max(hub.x+hub.width,detail.x+detail.width)
  const minSplit=left+(hubDetailDirection==='left'?260:340)
  const maxSplit=right-(hubDetailDirection==='left'?340:260)
  const split=Math.max(minSplit,Math.min(Math.round(screenX),maxSplit))
  syncingHubPair=true
  if(hubDetailDirection==='left'){
    hubDetailWindow.setBounds({x:left,y:hub.y,width:split-left,height:hub.height},false)
    hubWindow.setBounds({x:split,y:hub.y,width:right-split,height:hub.height},false)
  }else{
    hubWindow.setBounds({x:left,y:hub.y,width:split-left,height:hub.height},false)
    hubDetailWindow.setBounds({x:split,y:hub.y,width:right-split,height:hub.height},false)
  }
  syncingHubPair=false
})
ipcMain.on('hub-detail:request-close',event=>{
  if(!hubWindow||event.sender!==hubWindow.webContents||!hubDetailWindow||hubDetailWindow.isDestroyed())return
  hubDetailWindow.webContents.send('hub-detail:request-close')
})

ipcMain.on('window:close-self', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})

app.on('window-all-closed', () => {
  // Keep running in the tray on macOS/Windows/Linux; only the stats
  // window is a "normal" closable window, the cat lives in the tray.
})
