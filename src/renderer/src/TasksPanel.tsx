import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { addDays, todayStr } from '../../shared/date'
import { DEFAULT_LIST, TASK_COLORS, TASK_ICONS, completedOn, scheduledOn, periodDays, shiftPeriod, type TaskData, type TaskItem, type TaskList, type TaskView } from '../../shared/tasks'
import { useVisibleInterval } from './useVisibleInterval'

function calendarDistance(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

function taskOrder(task: TaskItem, day: string): string {
  const due = task.dueDate ?? task.createdDate
  const done = completedOn(task, day) ? '1' : '0'
  return `${due}-${done}-${task.dueTime ?? '99:99'}-${task.createdDate}`
}

export function GlassDatePicker({value,onChange,label,align='left'}:{value:string;onChange:(value:string)=>void;label:string;align?:'left'|'right'}):React.JSX.Element{
  const [open,setOpen]=useState(false)
  const [month,setMonth]=useState(value.slice(0,7))
  const root=useRef<HTMLDivElement>(null)
  useEffect(()=>setMonth(value.slice(0,7)),[value])
  useEffect(()=>{
    if(!open)return
    const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false)}
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)}
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape)
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape)}
  },[open])
  const first=`${month}-01`,offset=(new Date(first+'T12:00:00').getDay()+6)%7
  const monthDays=Array.from({length:42},(_,index)=>addDays(first,index-offset))
  const shiftMonth=(delta:number)=>{const date=new Date(first+'T12:00:00');date.setMonth(date.getMonth()+delta);setMonth(todayStr(date).slice(0,7))}
  const shown=new Date(value+'T12:00:00').toLocaleDateString('zh-CN',{month:'short',day:'numeric',weekday:'short'})
  return <div ref={root} className={`glass-date-picker align-${align}`}>
    <input className="glass-date-native" type="text" tabIndex={-1} aria-label={label} value={value} onChange={event=>onChange(event.target.value)}/>
    <button type="button" className="glass-date-trigger" aria-label={`选择${label}`} aria-expanded={open} onClick={()=>setOpen(current=>!current)}><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12" rx="2.5"/><path d="M6.5 2.8v3.4M13.5 2.8v3.4M3 8h14"/></svg><span>{shown}</span><i>⌄</i></button>
    {open&&<div className="glass-date-popover" role="dialog" aria-label={`${label}日历`}>
      <header><button type="button" aria-label="上个月" onClick={()=>shiftMonth(-1)}>‹</button><strong>{month.replace('-', ' 年 ')} 月</strong><button type="button" aria-label="下个月" onClick={()=>shiftMonth(1)}>›</button></header>
      <div className="glass-date-weekdays">{'一二三四五六日'.split('').map(day=><span key={day}>{day}</span>)}</div>
      <div className="glass-date-grid">{monthDays.map(day=><button type="button" key={day} aria-label={`选择日期 ${day}`} className={`${day===todayStr()?'today ':''}${day===value?'selected ':''}${day.slice(0,7)!==month?'outside':''}`} onClick={()=>{onChange(day);setOpen(false)}}>{Number(day.slice(8))}</button>)}</div>
      <footer><button type="button" onClick={()=>{const current=todayStr();onChange(current);setMonth(current.slice(0,7));setOpen(false)}}>回到今天</button></footer>
    </div>}
  </div>
}

export default function TasksPanel(): React.JSX.Element {
  const [data, setData] = useState<TaskData>({ items: [], lists: [DEFAULT_LIST] })
  const [date, setDate] = useState(todayStr())
  const [today, setToday] = useState(todayStr())
  const [view, setView] = useState<TaskView>('day')
  const [listId, setListId] = useState('all')
  const [text, setText] = useState('')
  const [dueDate, setDueDate] = useState(todayStr())
  const [dueTime, setDueTime] = useState('')
  const [countdown,setCountdown]=useState(false)
  const [newListId, setNewListId] = useState('default')
  const [composer, setComposer] = useState(false)
  const [editing, setEditing] = useState<TaskItem | null>(null)
  const [listEditor, setListEditor] = useState<(Omit<TaskList, 'id'> & { id?: string }) | null>(null)
  const [editingLists,setEditingLists]=useState(false)
  const [pendingTaskDelete,setPendingTaskDelete]=useState<string|null>(null)
  const [pendingListDelete,setPendingListDelete]=useState<TaskList|null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const refresh = async () => { setData(await window.api.getTaskData()); setToday(todayStr()) }
  useEffect(() => {
    const reload = () => { refresh().catch(() => setError('任务读取失败，请重试')) }
    reload()
    const off = window.api.onDataImported(reload)
    return () => { off() }
  }, [])
  useVisibleInterval(() => { refresh().catch(() => setError('任务读取失败，请重试')) }, 10_000)
  const act = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true); setError('')
    try { await fn(); await refresh() } catch (e) { setError(e instanceof Error ? e.message : '操作失败，请重试') }
    finally { setBusy(false) }
  }
  const selectedList = data.lists.find(l => l.id === listId)
  const accent = selectedList?.color ?? '#007aff'
  const tasks = data.items.filter(t => listId === 'all' || t.listId === listId)
  const days = periodDays(date, view)
  const overdue = date === today && view === 'day' ? tasks.filter(t => !t.completed && (t.dueDate ?? t.createdDate) < today) : []
  const groups = days.map(day => {
    const scheduled = tasks.filter(t => scheduledOn(t, day))
    const upcoming = view === 'day'
      ? tasks.filter(t => !t.completed && (t.dueDate ?? t.createdDate) > day)
      : []
    return { day, tasks: [...scheduled, ...upcoming].sort((a, b) => taskOrder(a, day).localeCompare(taskOrder(b, day))), upcoming: new Set(upcoming.map(t => t.id)) }
  }).filter(g => g.tasks.length)
  const pending = groups.reduce((sum, g) => sum + g.tasks.filter(t => !g.upcoming.has(t.id) && !completedOn(t, g.day)).length, 0) + overdue.length
  const calendarDays = view === 'month' ? (() => {
    const first = days[0], offset = (new Date(first + 'T12:00:00').getDay() + 6) % 7
    return Array.from({ length: Math.ceil((offset + days.length) / 7) * 7 }, (_, i) => addDays(first, i - offset))
  })() : periodDays(date, 'week')
  const selectDate = (value: string) => { setDate(value); setDueDate(value) }
  const openNew = () => { setEditing(null); setText(''); setDueDate(date); setDueTime('');setCountdown(false); setNewListId(selectedList?.id ?? 'default'); setComposer(true) }
  const editTask = (task: TaskItem) => { setEditing(task); setText(task.text); setDueDate(task.dueDate ?? task.createdDate); setDueTime(task.dueTime ?? '');setCountdown(task.countdown); setNewListId(task.listId); setComposer(true) }
  const saveTask = () => act(async () => {
    if (editing) await window.api.updateTask(editing.id, { text, dueDate, dueTime:dueTime||null, listId: newListId,countdown })
    else await window.api.addTask(text, false, { dueDate, dueTime:dueTime||null, listId: newListId,countdown })
    setComposer(false); setText(''); setEditing(null)
  })
  const taskRow = (task: TaskItem, day: string, late = false, upcoming = false) => {
    const list = data.lists.find(l => l.id === task.listId) ?? DEFAULT_LIST
    const done = completedOn(task, day)
    const due = task.dueDate ?? task.createdDate
    const remaining = calendarDistance(day, due)
    const dueLabel = upcoming
      ? `${remaining === 1 ? '明天' : `还有 ${remaining} 天`} · ${due.slice(5).replace('-', '月')}日${task.dueTime ? ` ${task.dueTime}` : ''} 前完成`
      : due === day
        ? `${day === today ? '今天' : '当日'}${task.dueTime ? ` ${task.dueTime}` : ''} 前完成`
        : `截止 ${due}${task.dueTime ? ` ${task.dueTime}` : ''}`
    return <div key={`${task.id}-${day}`} className={`reminder-row${upcoming ? ' upcoming' : ''}`} style={{ '--list-color': list.color } as CSSProperties}>
      <button className={`reminder-check${done ? ' checked' : ''}`} disabled={busy} aria-label={`${done ? '取消完成' : '完成'} ${task.text}`} onClick={() => act(() => window.api.toggleTask(task.id, day))}>{done && '✓'}</button>
      <button className={`reminder-body${done ? ' completed' : ''}`} onClick={() => editTask(task)} aria-label={`编辑 ${task.text}`}><span>{task.text}</span><small><i>{list.icon} {list.name}</i><em className={late ? 'overdue' : upcoming ? 'upcoming-time' : ''}>{late ? '已逾期 · ' : ''}{dueLabel}{task.countdown?' · 倒计时':''}</em></small></button>
      {pendingTaskDelete===task.id?<div className="task-delete-confirm"><button onClick={()=>setPendingTaskDelete(null)}>取消</button><button className="danger" disabled={busy} onClick={()=>act(async()=>{await window.api.deleteTask(task.id);setPendingTaskDelete(null)})}>删除</button></div>:<button className="task-delete" aria-label={`删除 ${task.text}`} disabled={busy} onClick={() => setPendingTaskDelete(task.id)}>×</button>}
    </div>
  }
  return <section className="reminders-view" style={{ '--list-color': accent } as CSSProperties}>
    <div className="reminders-heading"><div><h2>{selectedList?.name ?? '提醒事项'}</h2><p>{pending} 项待完成 · {view === 'day' ? '当日' : view === 'week' ? '本周' : '本月'}计划</p></div><button className="reminder-add" onClick={openNew} aria-label="添加任务">＋</button></div>
    <div className={`reminder-lists${editingLists?' editing':''}`} aria-label="分类清单"><button className={listId === 'all' ? 'active' : ''} onClick={() => setListId('all')}>全部</button>{data.lists.map(list => <button key={list.id} className={listId === list.id ? 'active' : ''} style={{ '--list-color': list.color } as CSSProperties} onClick={() => {if(editingLists)setListEditor({...list});else{setListId(list.id);setNewListId(list.id)}}}>{editingLists&&list.id!=='default'&&<span className="list-remove" role="button" aria-label={`删除清单 ${list.name}`} onClick={event=>{event.stopPropagation();setPendingListDelete(list)}}>−</span>}<span>{list.icon}</span>{list.name}</button>)}{editingLists&&<button aria-label="新建分类" onClick={() => setListEditor({ name: '', color: TASK_COLORS[0], icon: TASK_ICONS[0] })}>＋ 清单</button>}<button aria-label="编辑清单" className={editingLists?'active':''} onClick={()=>{setEditingLists(value=>!value);setPendingListDelete(null);setListEditor(null)}}>{editingLists?'完成':'编辑'}</button></div>
    {pendingListDelete&&<div className="list-delete-confirm" role="alert"><span>删除“{pendingListDelete.name}”？其中任务会移到“提醒事项”。</span><button onClick={()=>setPendingListDelete(null)}>取消</button><button className="danger" disabled={busy} onClick={()=>act(async()=>{await window.api.deleteTaskList(pendingListDelete.id);if(listId===pendingListDelete.id)setListId('all');setPendingListDelete(null)})}>删除清单</button></div>}
    {listEditor && <div className="reminder-editor" aria-label="分类编辑器"><input aria-label="分类名称" placeholder="清单名称" value={listEditor.name} onChange={e => setListEditor({ ...listEditor, name: e.target.value })} />
      <div className="list-palette" aria-label="分类颜色">{TASK_COLORS.map(color => <button key={color} aria-label={`颜色 ${color}`} aria-pressed={listEditor.color === color} style={{ background: color }} onClick={() => setListEditor({ ...listEditor, color })}>{listEditor.color === color ? '✓' : ''}</button>)}</div>
      <div className="list-icons" aria-label="分类图标">{TASK_ICONS.map(icon => <button key={icon} aria-label={`图标 ${icon}`} aria-pressed={listEditor.icon === icon} onClick={() => setListEditor({ ...listEditor, icon })}>{icon}</button>)}</div>
      <div className="editor-actions"><button className="secondary-button" onClick={() => setListEditor(null)}>取消</button><button className="primary-button" disabled={busy || !listEditor.name.trim()} onClick={() => act(async () => { const list = await window.api.saveTaskList(listEditor); setListId(list.id); setNewListId(list.id); setListEditor(null) })}>保存分类</button></div></div>}
    <div className="reminder-calendar-bar"><div className="reminder-view-switch" aria-label="任务视图">{(['day', 'week', 'month'] as const).map((v, i) => <button key={v} aria-pressed={view === v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>{['日', '周', '月'][i]}</button>)}</div><button className="text-button" onClick={() => selectDate(today)}>今天</button><GlassDatePicker value={date} label="跳转日期" align="right" onChange={selectDate}/></div>
    <div className="reminder-date-nav"><button aria-label="上一时段" onClick={() => selectDate(shiftPeriod(date, view, -1))}>‹</button><strong>{view === 'month' ? date.slice(0, 7).replace('-', ' 年 ') + ' 月' : view === 'week' ? `${days[0].slice(5)} — ${days[6].slice(5)}` : new Date(date + 'T12:00:00').toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}</strong><button aria-label="下一时段" onClick={() => selectDate(shiftPeriod(date, view, 1))}>›</button></div>
    {view !== 'day' && <div className={`reminder-calendar ${view}`}><div className="calendar-weekdays">{'一二三四五六日'.split('').map(d => <span key={d}>{d}</span>)}</div><div className="calendar-grid">{calendarDays.map(day => {
      const items = tasks.filter(t => scheduledOn(t, day))
      const colors = [...new Set(items.map(t => data.lists.find(l => l.id === t.listId)?.color ?? accent))].slice(0, 3)
      return <button key={day} aria-label={`查看 ${day}`} className={`${day === today ? 'today ' : ''}${day === date ? 'selected ' : ''}${view === 'month' && day.slice(0, 7) !== date.slice(0, 7) ? 'outside' : ''}`} onClick={() => { selectDate(day); setView('day') }}><span>{Number(day.slice(-2))}</span><small>{colors.map(c => <i key={c} style={{ background: c }} />)}</small></button>
    })}</div></div>}
    {error && <p className="error-message" role="alert">{error}</p>}
    {composer && <form className="reminder-editor" aria-label="任务编辑器" onSubmit={e => { e.preventDefault(); saveTask() }}><input autoFocus aria-label="任务标题" placeholder="要提醒自己什么？" value={text} onChange={e => setText(e.target.value)} /><div className="task-detail-fields"><label>截止日期<GlassDatePicker value={dueDate} label="截止日期" onChange={setDueDate}/></label><label>提醒时间（可选）<input type="time" aria-label="提醒时间" value={dueTime} onChange={e => setDueTime(e.target.value)} /></label><label>清单<select aria-label="任务分类" value={newListId} onChange={e => setNewListId(e.target.value)}>{data.lists.map(list => <option key={list.id} value={list.id}>{list.icon} {list.name}</option>)}</select></label></div><div className="task-options"><label className="repeat-option countdown-option"><input aria-label="加入气泡倒计时" type="checkbox" checked={countdown} onChange={e=>setCountdown(e.target.checked)}/>在单击气泡显示倒计时</label></div><div className="editor-actions"><button type="button" className="secondary-button" onClick={() => setComposer(false)}>取消</button><button className="primary-button" disabled={busy || !text.trim() || !dueDate}>{editing ? '保存修改' : '添加提醒'}</button></div></form>}
    <div className="reminder-agenda">{overdue.length > 0 && <div className="reminder-date-group"><h3 className="overdue">逾期 · {overdue.length} 项</h3>{overdue.map(t => taskRow(t, today, true))}</div>}{groups.map(g => { const scheduled = g.tasks.filter(t => !g.upcoming.has(t.id)); return <div key={g.day} className="reminder-date-group"><h3>{g.day === today ? '今天' : g.day} <span>{scheduled.filter(t => completedOn(t, g.day)).length}/{scheduled.length} 已完成</span></h3>{g.tasks.map(t => taskRow(t, g.day, false, g.upcoming.has(t.id)))}</div> })}{!groups.length && !overdue.length && <p className="reminder-empty">这段时间还没有提醒事项<br /><button className="text-button" onClick={openNew}>＋ 为 {date.slice(5)} 添加一项</button></p>}</div>
  </section>
}
