import Store from './cachedStore'
import { todayStr, addDays } from '../shared/date'
import { periodRange, type CheckinPeriod, type DailyWorkSummary, type WorkStatistics } from '../shared/statistics'

export type WorkState = string
export type ResetTarget = 'all' | 'companion' | 'keystrokes' | WorkState
export interface Segment {
  state: WorkState
  startedAt: number
  endedAt: number | null
  keystrokes: number
}
export interface WorkStateSchema {
  date: string
  segments: Segment[]
  history: Record<string, Segment[]>
  state: WorkState
  paused: boolean
  startedToday: boolean
  checkpoint: number
  timeOffsets: Partial<Record<WorkState, number>>
  companionOffset: number
  historyResets: Record<string, { timeOffsets: Partial<Record<WorkState, number>>; companionOffset: number }>
}
export const workStore = new Store<WorkStateSchema>({
  name: 'work-state',
  defaults: { date: '', segments: [], history: {}, state: 'focus', paused: false, startedToday: false, checkpoint: 0, timeOffsets: {}, companionOffset: 0, historyResets: {} }
})
let initialized = false
let suspended = false

function closeSegment(at: number): void {
  const segments = workStore.get('segments')
  const last = segments.at(-1)
  if (last && last.endedAt === null) {
    last.endedAt = Math.max(last.startedAt, at)
    workStore.set('segments', segments)
  }
}

function archiveResetMetadata(date: string): void {
  if (date) workStore.set('historyResets', { ...(workStore.get('historyResets') ?? {}), [date]: {
    timeOffsets: workStore.get('timeOffsets') ?? {}, companionOffset: workStore.get('companionOffset') ?? 0
  } })
  workStore.set('timeOffsets', {}); workStore.set('companionOffset', 0)
}
function rawDurations(segments: Segment[], now = Date.now()): Record<WorkState, number> {
  const result: Record<string,number> = { focus: 0, break: 0, lunch: 0, meeting: 0, off: 0 }
  for (const s of segments) result[s.state] = (result[s.state] ?? 0) + Math.max(0, (s.endedAt ?? now) - s.startedAt) / 1000
  return result
}

function ensureToday(): Segment[] {
  const now = Date.now()
  if (!initialized) {
    // An old open segment must never include time while the app was stopped.
    const last = workStore.get('segments').at(-1)
    if (last) {
      if (!workStore.get('checkpoint')) workStore.set('state', last.state)
      closeSegment(workStore.get('checkpoint') || last.startedAt)
    }
    initialized = true
  }
  const today = todayStr()
  if (workStore.get('date') !== today) {
    const oldDate = workStore.get('date')
    const last = workStore.get('segments').at(-1)
    if(oldDate){
      if(oldDate<today&&workStore.get('startedToday')&&last?.endedAt===null&&!workStore.get('paused')&&!suspended){
        const midnight=new Date(addDays(oldDate,1)+'T00:00:00').getTime()
        closeSegment(Math.min(now,midnight))
      }
      workStore.set('history', { ...workStore.get('history'), [oldDate]: workStore.get('segments') })
    }
    archiveResetMetadata(oldDate)
    workStore.set('segments', [])
    workStore.set('date', today)
    workStore.set('startedToday',false)
    workStore.set('paused',false)
    workStore.set('checkpoint',now)
  }
  const segments = workStore.get('segments')
  if (workStore.get('startedToday') && !workStore.get('paused') && !suspended && segments.at(-1)?.endedAt !== null) {
    segments.push({ state: workStore.get('state'), startedAt: now, endedAt: null, keystrokes: 0 })
    workStore.set('segments', segments)
  }
  return segments
}

export function checkpointWorkState(): void {
  ensureToday()
  workStore.set('checkpoint', Date.now())
}
export function suspendRecording(): void {
  ensureToday()
  closeSegment(Date.now())
  suspended = true
  workStore.set('checkpoint', Date.now())
}
export function resumeRecording(): void {
  suspended = false
  ensureToday()
}
export function reloadWorkState(): void { initialized = false; ensureToday() }
export function isRecording(): boolean { ensureToday(); return workStore.get('startedToday') && !workStore.get('paused') && !suspended }
export function getCurrentState(): WorkState { ensureToday(); return workStore.get('state') }
export function switchState(next: WorkState): void {
  ensureToday()
  if (!workStore.get('startedToday')) {
    workStore.set('state',next)
    workStore.set('startedToday',true)
    workStore.set('paused',false)
    ensureToday()
    return
  }
  if (workStore.get('state') === next) return
  closeSegment(Date.now())
  workStore.set('state', next)
  ensureToday()
}
export function setRecordingPaused(paused: boolean): void {
  ensureToday()
  closeSegment(Date.now())
  workStore.set('paused', paused)
  ensureToday()
}
export function resetTodayRecording(target: ResetTarget = 'all'): void {
  const segments = ensureToday()
  if (target === 'all') {
    workStore.set('segments', []); workStore.set('timeOffsets', {}); workStore.set('companionOffset', 0)
    ensureToday()
  } else if (target === 'keystrokes') workStore.set('segments', segments.map(s => ({ ...s, keystrokes: 0 })))
  else {
    const raw = rawDurations(segments)
    if (target === 'companion') workStore.set('companionOffset', Object.values(raw).reduce((a, b) => a + b, 0))
    else workStore.set('timeOffsets', { ...(workStore.get('timeOffsets') ?? {}), [target]: raw[target] ?? 0 })
  }
}
export function correctTodayDuration(target:'companion'|WorkState,seconds:number):void{
  if(!Number.isFinite(seconds)||seconds<0)throw new Error('修正时长必须大于等于 0')
  const raw=rawDurations(ensureToday())
  if(target==='companion')workStore.set('companionOffset',Object.values(raw).reduce((a,b)=>a+b,0)-seconds)
  else workStore.set('timeOffsets',{...(workStore.get('timeOffsets')??{}),[target]:(raw[target]??0)-seconds})
}
export function recordSegmentKeystroke(): void {
  const segments = ensureToday()
  if (!isRecording()) return
  const last = segments.at(-1)
  if (last) { last.keystrokes++; workStore.set('segments', segments) }
}
export function getFocusSecondsToday(): number { return getWorkSnapshot().durations.focus ?? 0 }
export function getKeystrokesToday(): number { return ensureToday().reduce((sum, s) => sum + s.keystrokes, 0) }
export function getWorkSnapshot() {
  const segments = ensureToday()
  const raw = rawDurations(segments)
  const offsets = workStore.get('timeOffsets') ?? {}
  const durations = { ...raw }
  for (const state of new Set([...Object.keys(raw), ...Object.keys(offsets)])) durations[state] = Math.max(0, (raw[state] ?? 0) - (offsets[state] ?? 0))
  return {
    state: workStore.get('state'), paused: workStore.get('paused'), startedToday:workStore.get('startedToday'),
    timeline: [...segments].reverse(), durations,
    focusSeconds: durations.focus ?? 0, companionSeconds: Math.max(0, Object.values(raw).reduce((a, b) => a + b, 0) - (workStore.get('companionOffset') ?? 0)),
    keystrokesToday: getKeystrokesToday()
  }
}

function summaryForDate(date:string):DailyWorkSummary{
  const today=todayStr()
  const segments=date===today?ensureToday():(workStore.get('history')??{})[date]??[]
  const raw=rawDurations(segments,date===today?Date.now():undefined)
  const reset=date===today
    ?{timeOffsets:workStore.get('timeOffsets')??{},companionOffset:workStore.get('companionOffset')??0}
    :(workStore.get('historyResets')??{})[date]??{timeOffsets:{},companionOffset:0}
  const durations={...raw}
  for(const state of new Set([...Object.keys(raw),...Object.keys(reset.timeOffsets)]))durations[state]=Math.max(0,(raw[state]??0)-(reset.timeOffsets[state]??0))
  return{
    date,
    durations,
    companionSeconds:Math.max(0,Object.values(raw).reduce((sum,value)=>sum+value,0)-reset.companionOffset),
    keystrokes:segments.reduce((sum,segment)=>sum+segment.keystrokes,0)
  }
}

export function getWorkStatistics(period:CheckinPeriod,anchorDate=todayStr()):WorkStatistics{
  ensureToday()
  const {startDate,endDate}=periodRange(period,anchorDate)
  const days:DailyWorkSummary[]=[]
  for(let date=startDate;date<=endDate;date=addDays(date,1))days.push(summaryForDate(date))
  const durations:Record<string,number>={}
  for(const day of days)for(const [state,seconds] of Object.entries(day.durations))durations[state]=(durations[state]??0)+seconds
  return{
    period,anchorDate,startDate,endDate,days,durations,
    companionSeconds:days.reduce((sum,day)=>sum+day.companionSeconds,0),
    keystrokes:days.reduce((sum,day)=>sum+day.keystrokes,0),
    activeDays:days.filter(day=>day.companionSeconds>0||day.keystrokes>0).length
  }
}
