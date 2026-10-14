import { useEffect,useState } from 'react'
import { addDays,todayStr } from '../../shared/date'
import { studyCompletedOn,studyScheduledOn,type StudyData,type StudySchedule,type StudyTask } from '../../shared/study'
import { GlassDatePicker } from './TasksPanel'

export default function StudyPanel():React.JSX.Element{
  const [date,setDate]=useState(todayStr()),[data,setData]=useState<StudyData>({items:[]}),[editing,setEditing]=useState<StudyTask|null>(null)
  const [composer,setComposer]=useState(false),[title,setTitle]=useState(''),[schedule,setSchedule]=useState<StudySchedule>('daily'),[targetDate,setTargetDate]=useState(todayStr()),[reminder,setReminder]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const load=()=>window.api.getStudyData().then(setData).catch(()=>setError('学习计划读取失败'))
  useEffect(()=>{void load();const imported=window.api.onDataImported(load);return imported},[])
  const items=data.items.filter(item=>studyScheduledOn(item,date)).sort((a,b)=>(a.reminderTime??'99:99').localeCompare(b.reminderTime??'99:99')||a.createdAt-b.createdAt)
  const done=items.filter(item=>studyCompletedOn(item,date)).length
  const act=async(fn:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);setError('');try{await fn();await load()}catch(e){setError(e instanceof Error?e.message:'操作失败')}finally{setBusy(false)}}
  const openNew=()=>{setEditing(null);setTitle('');setSchedule('daily');setTargetDate(date);setReminder('');setComposer(true)}
  const openEdit=(item:StudyTask)=>{setEditing(item);setTitle(item.title);setSchedule(item.schedule);setTargetDate(item.targetDate??item.startDate);setReminder(item.reminderTime??'');setComposer(true)}
  const save=()=>act(async()=>{await window.api.saveStudyTask({title,schedule,startDate:editing?.startDate??date,targetDate:schedule==='date'?targetDate:null,reminderTime:reminder||null,enabled:true},editing?.id);setComposer(false);setEditing(null)})
  return <section className="study-view glass-view">
    <header className="study-heading"><div><h2>学习打卡</h2><p>每天一点点，也会留下清楚的轨迹。</p></div><button className="reminder-add" aria-label="添加学习计划" onClick={openNew}>＋</button></header>
    <div className="study-date-nav"><button onClick={()=>setDate(value=>addDays(value,-1))}>‹</button><GlassDatePicker value={date} onChange={setDate} label="打卡日期"/><button onClick={()=>setDate(value=>addDays(value,1))}>›</button><button className="text-button" onClick={()=>setDate(todayStr())}>今天</button></div>
    <section className="study-progress"><div className="study-ring" style={{'--progress':`${items.length?done/items.length*360:0}deg`} as React.CSSProperties}><strong>{done}<small>/{items.length}</small></strong></div><div><strong>{done===items.length&&items.length?'今日计划完成':'今日学习计划'}</strong><span>{items.length?`还有 ${items.length-done} 项待打卡`:'这一天还没有安排'}</span></div></section>
    {error&&<p className="error-message">{error}</p>}
    {composer&&<form className="study-editor" onSubmit={event=>{event.preventDefault();void save()}}><input autoFocus aria-label="学习任务" placeholder="例如：背 30 个单词" value={title} onChange={event=>setTitle(event.target.value)}/><div className="study-schedule"><button type="button" className={schedule==='daily'?'active':''} onClick={()=>setSchedule('daily')}>每天一样</button><button type="button" className={schedule==='date'?'active':''} onClick={()=>setSchedule('date')}>只在某天</button></div>{schedule==='date'&&<label>安排日期<GlassDatePicker value={targetDate} onChange={setTargetDate} label="安排日期"/></label>}<label>每日提醒（可选）<input type="time" value={reminder} onChange={event=>setReminder(event.target.value)}/></label><div className="editor-actions"><button type="button" className="secondary-button" onClick={()=>setComposer(false)}>取消</button><button className="primary-button" disabled={!title.trim()||busy}>{editing?'保存修改':'加入计划'}</button></div></form>}
    <div className="study-list">{items.map(item=>{const checked=studyCompletedOn(item,date);return <article key={item.id} className={checked?'done':''}><button className={`study-check${checked?' checked':''}`} onClick={()=>act(()=>window.api.toggleStudyTask(item.id,date))}>{checked?'✓':''}</button><button className="study-body" onClick={()=>openEdit(item)}><strong>{item.title}</strong><small>{item.schedule==='daily'?'每天':item.targetDate?.slice(5)}{item.reminderTime?` · ${item.reminderTime} 提醒`:''}</small></button><button className="study-delete" aria-label={`删除 ${item.title}`} onClick={()=>act(()=>window.api.deleteStudyTask(item.id))}>×</button></article>})}{!items.length&&!composer&&<div className="study-empty"><span>◎</span><p>还没有学习计划</p><button className="text-button" onClick={openNew}>＋ 安排第一项</button></div>}</div>
  </section>
}
