import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { todayStr } from '../../shared/date'
import { shiftStatisticsPeriod, type CheckinPeriod, type WorkStatistics } from '../../shared/statistics'
import type { WorkStateDefinition } from '../../shared/workStates'
import type { MusicSnapshot,MusicStatistics } from '../../shared/music'
import { useVisibleInterval } from './useVisibleInterval'

const PERIODS:[CheckinPeriod,string][]=[['week','周'],['month','月'],['year','年']]
const empty:WorkStatistics={period:'week',anchorDate:'',startDate:'',endDate:'',days:[],companionSeconds:0,keystrokes:0,durations:{},activeDays:0}
function duration(seconds:number):string{
  const minutes=Math.round(seconds/60)
  if(minutes<60)return`${minutes} 分钟`
  const hours=Math.floor(minutes/60),rest=minutes%60
  return rest?`${hours} 小时 ${rest} 分`:`${hours} 小时`
}
function periodTitle(stats:WorkStatistics):string{
  if(!stats.startDate)return'正在读取'
  const start=new Date(stats.startDate+'T12:00:00'),end=new Date(stats.endDate+'T12:00:00')
  if(stats.period==='year')return`${start.getFullYear()} 年`
  if(stats.period==='month')return`${start.getFullYear()} 年 ${start.getMonth()+1} 月`
  const left=`${start.getMonth()+1}.${start.getDate()}`,right=`${end.getMonth()+1}.${end.getDate()}`
  return`${left} — ${right}`
}
function chartBuckets(stats:WorkStatistics,music:MusicStatistics):{key:string;label:string;companionSeconds:number;keystrokes:number;musicSeconds:number}[]{
  const musicByDate=new Map(music.days.map(day=>[day.date,day.seconds]))
  if(stats.period!=='year')return stats.days.map((day,index)=>({key:day.date,label:stats.period==='week'?['一','二','三','四','五','六','日'][index]:String(Number(day.date.slice(8))),companionSeconds:day.companionSeconds,keystrokes:day.keystrokes,musicSeconds:musicByDate.get(day.date)??0}))
  return Array.from({length:12},(_,month)=>{
    const days=stats.days.filter(day=>Number(day.date.slice(5,7))===month+1)
    const musicDays=music.days.filter(day=>Number(day.date.slice(5,7))===month+1)
    return{key:String(month),label:`${month+1}月`,companionSeconds:days.reduce((n,day)=>n+day.companionSeconds,0),keystrokes:days.reduce((n,day)=>n+day.keystrokes,0),musicSeconds:musicDays.reduce((n,day)=>n+day.seconds,0)}
  })
}

export default function CheckinPanel():React.JSX.Element{
  const [period,setPeriod]=useState<CheckinPeriod>('week')
  const [anchor,setAnchor]=useState(todayStr())
  const [stats,setStats]=useState<WorkStatistics>(empty)
  const [musicStats,setMusicStats]=useState<MusicStatistics>({startDate:'',endDate:'',days:[],totalSeconds:0})
  const [music,setMusic]=useState<MusicSnapshot>({enabled:false,playing:false,title:'',artist:'',todaySeconds:0,error:''})
  const [states,setStates]=useState<WorkStateDefinition[]>([])
  const [metric,setMetric]=useState<'time'|'keys'|'music'>('time')
  const [error,setError]=useState('')
  const load=()=>Promise.all([window.api.getWorkStatistics(period,anchor),window.api.getWorkStates(),window.api.getMusicStatistics(period,anchor),window.api.getMusicSnapshot()]).then(([next,definitions,nextMusicStats,nextMusic])=>{setStats(next);setStates(definitions);setMusicStats(nextMusicStats);setMusic(nextMusic);setError('')}).catch(()=>setError('统计读取失败，请重试'))
  useVisibleInterval(load,30_000,[period,anchor])
  useEffect(()=>{void load();const off=window.api.onWorkStateUpdated(load);const musicOff=window.api.onMusicUpdated(next=>{setMusic(next);void window.api.getMusicStatistics(period,anchor).then(setMusicStats)});const imported=window.api.onDataImported(load);return()=>{off();musicOff();imported()}},[period,anchor])
  const buckets=useMemo(()=>chartBuckets(stats,musicStats),[stats,musicStats])
  const metricValue=(bucket:(typeof buckets)[number])=>metric==='time'?bucket.companionSeconds:metric==='keys'?bucket.keystrokes:bucket.musicSeconds
  const max=Math.max(1,...buckets.map(metricValue))
  const average=buckets.reduce((sum,bucket)=>sum+metricValue(bucket),0)/Math.max(1,buckets.length)
  const averageLabel=metric==='keys'?`${Math.round(average).toLocaleString()} 次`:duration(average)
  const focusLabel=states.find(state=>state.id==='focus')?.label??'工作'
  const activeStates=states.map(state=>({...state,seconds:stats.durations[state.id]??0})).filter(state=>state.seconds>0)
  const stateMax=Math.max(1,...activeStates.map(state=>state.seconds))
  const setRange=(next:CheckinPeriod)=>{setPeriod(next);setAnchor(todayStr())}
  return <div className="glass-view checkin-view">
    <header className="checkin-header"><div><h2>打卡统计</h2><p className="view-subtitle">把每天的陪伴与投入收进时间里。</p></div><button className="checkin-today" onClick={()=>setAnchor(todayStr())}>本期</button></header>
    <div className="checkin-periods" aria-label="统计周期">{PERIODS.map(([id,label])=><button key={id} className={period===id?'active':''} aria-pressed={period===id} onClick={()=>setRange(id)}>{label}</button>)}</div>
    <div className="checkin-navigator"><button aria-label="上一周期" onClick={()=>setAnchor(value=>shiftStatisticsPeriod(period,value,-1))}>‹</button><strong>{periodTitle(stats)}</strong><button aria-label="下一周期" onClick={()=>setAnchor(value=>shiftStatisticsPeriod(period,value,1))}>›</button></div>
    {error&&<p className="error-message" role="alert">{error}</p>}
    <section className="checkin-summary">
      <div className="checkin-primary"><span>陪伴时长</span><strong>{duration(stats.companionSeconds)}</strong><small>{stats.activeDays} 天留下记录</small></div>
      <div className="checkin-metrics"><div><span>敲键</span><strong>{stats.keystrokes.toLocaleString()} 次</strong></div><div><span>{focusLabel}</span><strong>{duration(stats.durations.focus??0)}</strong></div><div><span>听歌</span><strong>{duration(musicStats.totalSeconds)}</strong></div></div>
    </section>
    <section className="checkin-card checkin-trend">
      <header><div><strong>趋势</strong><small>{metric==='time'?'每日陪伴时长':metric==='keys'?'每日敲键次数':'每日听歌时长'}</small></div><div className="checkin-metric-toggle"><button className={metric==='time'?'active':''} onClick={()=>setMetric('time')}>时长</button><button className={metric==='keys'?'active':''} onClick={()=>setMetric('keys')}>敲键</button><button className={metric==='music'?'active':''} onClick={()=>setMetric('music')}>听歌</button></div></header>
      <div className={`checkin-chart checkin-chart--${period}`}><div className="checkin-average" style={{top:`${69-average/max*69}px`} as CSSProperties}><span>平均 {averageLabel}</span></div>{buckets.map(bucket=>{const value=metricValue(bucket);const exact=metric==='keys'?`${value.toLocaleString()} 次`:duration(value);return <div className="checkin-bar-slot" key={bucket.key} data-tooltip={`${bucket.key} · ${exact}`}><div className="checkin-bar-track"><i style={{height:`${Math.max(value?7:2,value/max*100)}%`} as CSSProperties}/></div><span>{bucket.label}</span></div>})}</div>
    </section>
    <section className="checkin-card music-card"><header><div><strong>Apple Music</strong><small>{music.enabled?(music.playing?`正在播放 · ${music.title}`:'等待播放'):'开启后自动累计实际播放时间'}</small></div><label className="music-switch"><em>{music.enabled?'已开启':'开启统计'}</em><input type="checkbox" checked={music.enabled} onChange={event=>{const enabled=event.target.checked;void window.api.setMusicTracking(enabled).then(setMusic)}}/><span/></label></header>{music.playing&&<p className="music-now"><b>{music.title}</b>{music.artist&&<span>{music.artist}</span>}</p>}{music.error&&<p className="music-error">{music.error}</p>}<p className="music-today">今日听歌 {duration(music.todaySeconds)}</p></section>
    <section className="checkin-card checkin-states"><header><strong>状态时长</strong><small>本{period==='week'?'周':period==='month'?'月':'年'}累计</small></header>{activeStates.length?activeStates.map(state=><div className="checkin-state" key={state.id}><div><span><i style={{background:state.color}}/>{state.label}</span><strong>{duration(state.seconds)}</strong></div><div className="checkin-state-track"><i style={{width:`${state.seconds/stateMax*100}%`,background:state.color}}/></div></div>):<p className="checkin-empty">这个周期还没有记录，切换一次状态就开始打卡。</p>}</section>
  </div>
}
