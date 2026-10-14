import { useEffect, useState } from 'react'
import type { WorkState, WorkStateSnapshot, TaskItem } from '../../preload'
import { DEFAULT_WORK_STATES, WORK_STATE_PATHS, type WorkStateDefinition } from '../../shared/workStates'
import { todayStr } from '../../shared/date'
import { compareBubbleTasks } from '../../shared/tasks'
import type { MusicSnapshot } from '../../shared/music'

export function duration(seconds: number): string {
  const n = Math.floor(seconds)
  return `${String(Math.floor(n / 3600)).padStart(2, '0')}:${String(Math.floor(n / 60) % 60).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
}
function compactDuration(seconds: number): string {
  const n = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(n / 3600)
  const minutes = Math.floor(n / 60) % 60
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}` : `${minutes} 分`
}
function listeningDuration(seconds:number):string{
  const minutes=Math.floor(Math.max(0,seconds)/60),hours=Math.floor(minutes/60),rest=minutes%60
  return hours?`${hours} 小时${rest?` ${rest} 分`:''}`:`${minutes} 分钟`
}
function countdownLabel(task:TaskItem):string{
  if(!task.countdown||!task.dueDate)return task.text
  const [ty,tm,td]=todayStr().split('-').map(Number),[dy,dm,dd]=task.dueDate.split('-').map(Number)
  const days=Math.round((Date.UTC(dy,dm-1,dd)-Date.UTC(ty,tm-1,td))/86400000)
  return days>0?`还有 ${days} 天${task.text}`:days===0?`今天${task.text}`:`已到期 · ${task.text}`
}
function countdownText(task:TaskItem):React.ReactNode{
  if(!task.countdown||!task.dueDate)return task.text
  const [ty,tm,td]=todayStr().split('-').map(Number),[dy,dm,dd]=task.dueDate.split('-').map(Number)
  const days=Math.round((Date.UTC(dy,dm-1,dd)-Date.UTC(ty,tm-1,td))/86400000)
  return days>0?<>还有 <b className="bubble-number">{days}</b> 天 <b className="bubble-countdown-task">{task.text}</b></>:days===0?<><b className="bubble-number">今天</b> <b className="bubble-countdown-task">{task.text}</b></>:<>已到期 · <b className="bubble-countdown-task">{task.text}</b></>
}
export default function StatusPanel(): React.JSX.Element {
  const [data, setData] = useState<WorkStateSnapshot>()
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [states, setStates] = useState<WorkStateDefinition[]>(DEFAULT_WORK_STATES)
  const [petName, setPetName] = useState('小猫')
  const [music,setMusic]=useState<MusicSnapshot>({enabled:false,playing:false,title:'',artist:'',todaySeconds:0,error:''})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let alive = true
    const refresh = () => Promise.all([window.api.getWorkState(), window.api.getTasks(),window.api.getWorkStates(),window.api.getMusicSnapshot()]).then(([s, items,definitions,nextMusic]) => { if (alive) { setData(s); setTasks(items.filter(t => !t.completed).sort((a,b)=>compareBubbleTasks(a,b)));setStates(definitions);setMusic(nextMusic) } }).catch(() => { if (alive) setError('暂时无法读取记录') })
    window.api.getNotificationPreferences().then(p => { if (alive) setPetName(p.petName) }).catch(() => {})
    refresh()
    // Live durations tick every second, but only while the card is on screen.
    let timer: number | undefined = window.setInterval(refresh, 1000)
    const visibilityOff = window.api.onWindowVisibility(visible => {
      clearInterval(timer); timer = undefined
      if (visible) { refresh(); timer = window.setInterval(refresh, 1000) }
    })
    const off = window.api.onWorkStateUpdated(refresh)
    const musicOff=window.api.onMusicUpdated(next=>{if(alive)setMusic(next)})
    return () => { alive = false; clearInterval(timer); off();musicOff();visibilityOff() }
  }, [])
  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('')
    try { await fn(); setData(await window.api.getWorkState()) } catch { setError('操作未完成，请重试') } finally { setBusy(false) }
  }
  const current = states.find(s => s.id === data?.state)
  return <section className="pet-bubble status-window" aria-label="桌宠头顶状态气泡">
    <header className="bubble-header">
      <div className={`recording-label${data?.paused || data?.startedToday===false ? ' is-paused' : ''}`}><span style={{ background: data?.paused || data?.startedToday===false ? undefined : current?.color }} /><div><small>{petName}</small><strong>{data?.startedToday===false?'选择状态后开始计时':data?.paused ? '计时暂停啦' : `正在${current?.label ?? '陪伴中'}`}</strong></div></div>
      <button className="icon-button" aria-label="收起气泡" onClick={() => window.api.closeCatBubble()}>×</button>
    </header>
    {data ? <>
      <div className="bubble-message"><span>今天已经陪你</span><strong className="companion-clock">{duration(data.companionSeconds)}</strong><small>敲了 <b className="bubble-number">{data.keystrokesToday.toLocaleString()}</b> 次键 · 还有 <b className="bubble-number">{tasks.length}</b> 项待办</small></div>
      {music.enabled&&(music.playing||music.todaySeconds>0)&&<div className={`bubble-music${music.playing?' is-playing':''}`}><span>♪</span><div><strong>{music.playing?`正在听歌${music.title?` · ${music.title}`:''}`:'今天听过歌'}</strong><small>今日已听歌 <b>{listeningDuration(music.todaySeconds)}</b>{music.playing&&music.artist?` · ${music.artist}`:''}</small></div></div>}
      <div className="bubble-section-label"><span>切换状态</span><small>今日累计</small></div>
      <div className="status-options" aria-label="切换当前状态">{states.map(s => <button key={s.id} style={{'--state-color':s.color} as React.CSSProperties}
        className={data.state === s.id ? 'selected' : ''} aria-pressed={data.state === s.id}
        aria-label={`切换为${s.label}，今日累计${duration(data.durations[s.id] ?? 0)}`}
        title={`${s.label} ${duration(data.durations[s.id] ?? 0)}`}
        onClick={() => window.api.switchWorkState(s.id)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={WORK_STATE_PATHS[s.icon]} /></svg><span>{s.label}</span><small>{compactDuration(data.durations[s.id] ?? 0)}</small></button>)}</div>
      <div className={`bubble-tasks${tasks.length ? '' : ' bubble-tasks--empty'}`} aria-label="待办摘要" onWheel={event => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY }}>{tasks.length ? tasks.map(t => <div key={t.id} title={countdownLabel(t)}><span className="bubble-task-dot" /><span>{countdownText(t)}</span></div>) : <p>待办都完成啦，休息一下吧。</p>}</div>
      <footer className="bubble-footer"><button disabled={busy||!data.startedToday} onClick={() => action(() => window.api.pauseRecording(!data.paused))}>{!data.startedToday?'选择状态开始':data.paused ? '▶ 继续记录' : 'Ⅱ 暂停记录'}</button><select className="bubble-reset" aria-label="重置项目" disabled={busy} value="" onChange={e => { const target = e.target.value as 'all' | 'companion' | 'keystrokes' | WorkState; if (target) action(() => window.api.resetTodayRecording(target)) }}><option value="" disabled>重置…</option><option value="companion">今日陪伴时长</option><option value="keystrokes">今日按键数</option>{states.map(s => <option key={s.id} value={s.id}>{s.label}时长</option>)}<option value="all">重置今日全部</option></select><span>双击打开手帐</span></footer>
    </> : <p className="empty-message">正在读取…</p>}
    {error && <p role="alert" className="bubble-error">{error}</p>}
  </section>
}
