import { useEffect, useState } from 'react'
import type { UserSpriteItem } from '../../preload'
import type { CustomNoticeRule, NotificationPreferences, NoticeSchedule, NoticeTemplateKey } from '../../shared/notifications'

const DAYS = ['日', '一', '二', '三', '四', '五', '六']
const blankRule = (): CustomNoticeRule => ({ id: `notice-${Date.now()}`, time: '09:00', message: '', schedule: 'weekdays', days: [1, 2, 3, 4, 5], enabled: true,iconSpriteId:'' })

export default function NotificationSettingsPanel(): React.JSX.Element {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null)
  const [icon, setIcon] = useState('./cat/notifyIcon.svg')
  const [draft, setDraft] = useState<CustomNoticeRule | null>(null)
  const [library,setLibrary]=useState<UserSpriteItem[]>([])
  useEffect(() => {
    window.api.getNotificationPreferences().then(setPrefs)
    window.api.getSprites().then(s => setIcon(s.notifyIcon ?? './cat/notifyIcon.svg'))
    window.api.getUserSprites().then(setLibrary)
    return window.api.onSpritesUpdated(s => setIcon(s.notifyIcon ?? './cat/notifyIcon.svg'))
  }, [])
  const save = async (next: NotificationPreferences): Promise<void> => setPrefs(await window.api.setNotificationPreferences(next))
  const local = (next: NotificationPreferences): void => setPrefs(next)
  const toggle = (key: 'hourlyEnabled' | 'stateHourlyEnabled' | 'keystrokeEnabled') => prefs && save({ ...prefs, [key]: !prefs[key] })
  const setSchedule = (schedule: NoticeSchedule): void => setDraft(draft ? { ...draft, schedule, days: schedule === 'weekdays' ? [1,2,3,4,5] : schedule === 'weekends' ? [0,6] : draft.days } : null)
  const tags=[...new Set(library.flatMap(item=>item.tags))].sort()
  const iconOptions=(value:string,onChange:(value:string)=>void)=><select className="notice-icon-select" aria-label="消息贴图" value={value} onChange={e=>onChange(e.target.value)}><option value="">跟随随机池／当前图标</option>{library.map(item=><option value={item.id} key={item.id}>{item.name}{item.tags.length?` · ${item.tags.map(tag=>`#${tag}`).join(' ')}`:''}</option>)}</select>
  if (!prefs) return <div className="notification-settings-panel"><p className="sprite-hint">正在读取提醒设置…</p></div>
  return <div className="notification-settings-panel embedded-settings-panel">
    <div className="notice-icon-row"><img src={icon} alt="弹窗图标"/><div><strong>消息角色</strong><span>图标固定在弹窗最左侧，像桌宠在说话。</span></div><button onClick={async () => { const next = await window.api.pickSprite('notifyIcon'); if (next) {setIcon(next);setLibrary(await window.api.getUserSprites())} }}>更换</button></div>
    <h3 className="settings-section">随机图片标签</h3>
    <div className="notice-tag-pool">{tags.length?tags.map(tag=><button key={tag} className={prefs.randomIconTags.includes(tag)?'selected':''} aria-pressed={prefs.randomIconTags.includes(tag)} onClick={()=>save({...prefs,randomIconTags:prefs.randomIconTags.includes(tag)?prefs.randomIconTags.filter(value=>value!==tag):[...prefs.randomIconTags,tag]})}>#{tag}</button>):<small>先在“我的贴图库”里添加标签，即可按标签建立随机池。</small>}</div>
    {prefs.randomIconTags.length>1&&<p className="notice-pool-hint">随机池会选择同时含有 {prefs.randomIconTags.map(tag=>`#${tag}`).join('、')} 的贴图。</p>}
    <label className="pet-name-field"><span>桌宠名字</span><input aria-label="桌宠名字" maxLength={16} value={prefs.petName} onChange={e=>local({...prefs,petName:e.target.value})} onBlur={()=>prefs.petName.trim()&&save(prefs)}/></label>
    <h3 className="settings-section">出现位置</h3>
    <div className="notice-location">{([['pet','人物头顶'],['top-right','屏幕右上角']] as const).map(([value,label]) => <button key={value} className={prefs.location === value ? 'selected' : ''} onClick={() => save({ ...prefs, location:value })}>{label}</button>)}</div>
    <label className="notice-duration"><span>停留时长</span><input aria-label="弹窗停留秒数" type="range" min="2" max="30" step="0.5" value={prefs.displaySeconds} onChange={e=>save({...prefs,displaySeconds:Number(e.target.value)})}/><strong>{prefs.displaySeconds} 秒</strong></label>
    <h3 className="settings-section">自动报时</h3>
    <div className="notice-switches">
      <label><span><strong>整点报时</strong><small>每到整点播报当前时间</small></span><input type="checkbox" checked={prefs.hourlyEnabled} onChange={() => toggle('hourlyEnabled')}/></label>
      <label><span><strong>状态整点</strong><small>同一状态持续满整小时提醒</small></span><input type="checkbox" checked={prefs.stateHourlyEnabled} onChange={() => toggle('stateHourlyEnabled')}/></label>
      <label><span><strong>按键里程碑</strong><small>今日按键达到整数时提醒</small></span><input type="checkbox" checked={prefs.keystrokeEnabled} onChange={() => toggle('keystrokeEnabled')}/></label>
      {prefs.keystrokeEnabled && <label className="notice-step"><span>每隔</span><input aria-label="按键提醒间隔" type="number" min="100" step="100" value={prefs.keystrokeStep} onChange={e => save({ ...prefs, keystrokeStep:Number(e.target.value) || 1000 })}/><span>次</span></label>}
    </div>
    <h3 className="settings-section">默认消息</h3>
    <div className="notice-templates">{([['hourly','整点 · {time}'],['stateSwitch','切换状态 · {state}'],['stateHourly','状态 · {state} {hours}'],['keystroke','按键 · {count}'],['taskDue','任务到点 · {task}'],['taskComplete','任务完成 · {task}'],['off','下班 · {hours} {count}']] as const).map(([key,label])=><label key={key}><span>{label}</span><textarea aria-label={`默认消息 ${label}`} rows={2} value={prefs.templates[key]} onChange={e=>local({...prefs,templates:{...prefs.templates,[key]:e.target.value}})} onBlur={()=>save(prefs)}/>{iconOptions(prefs.templateIcons[key],value=>save({...prefs,templateIcons:{...prefs.templateIcons,[key as NoticeTemplateKey]:value}}))}</label>)}</div>
    <div className="notice-rules-title"><h3 className="settings-section">自定义定时消息</h3><button onClick={() => setDraft(blankRule())}>＋ 添加</button></div>
    <div className="notice-rules">{prefs.customRules.map(rule => <div className="notice-rule" key={rule.id}><button className={`notice-rule-toggle${rule.enabled ? ' on' : ''}`} aria-label="启用定时消息" onClick={() => save({ ...prefs, customRules:prefs.customRules.map(r => r.id === rule.id ? { ...r, enabled:!r.enabled } : r) })}/><div><strong>{rule.time}　{rule.message}</strong><small>{rule.schedule === 'weekdays' ? '工作日' : rule.schedule === 'weekends' ? '休息日' : rule.days.map(d => `周${DAYS[d]}`).join('、')}{rule.iconSpriteId?` · ${library.find(item=>item.id===rule.iconSpriteId)?.name??'指定贴图'}`:' · 跟随随机池'}</small></div><button className="rule-edit" aria-label="编辑定时消息" onClick={()=>setDraft({...rule})}>•••</button><button className="rule-delete" onClick={() => save({ ...prefs, customRules:prefs.customRules.filter(r => r.id !== rule.id) })}>×</button></div>)}</div>
    {draft && <div className="notice-rule-editor"><input aria-label="消息时间" type="time" value={draft.time} onChange={e => setDraft({ ...draft,time:e.target.value })}/><input aria-label="消息内容" placeholder="到点想让猫咪说什么？" value={draft.message} onChange={e => setDraft({ ...draft,message:e.target.value })}/>{iconOptions(draft.iconSpriteId??'',value=>setDraft({...draft,iconSpriteId:value}))}<div className="notice-schedule">{([['weekdays','工作日'],['weekends','休息日'],['custom','自选']] as const).map(([v,l]) => <button className={draft.schedule === v ? 'selected' : ''} key={v} onClick={() => setSchedule(v)}>{l}</button>)}</div>{draft.schedule === 'custom' && <div className="notice-days">{DAYS.map((day,index) => <button className={draft.days.includes(index) ? 'selected' : ''} key={day} onClick={() => setDraft({ ...draft,days:draft.days.includes(index) ? draft.days.filter(d => d !== index) : [...draft.days,index].sort() })}>{day}</button>)}</div>}<div className="editor-actions"><button className="secondary-button" onClick={() => setDraft(null)}>取消</button><button className="primary-button" disabled={!draft.message.trim() || (draft.schedule === 'custom' && !draft.days.length)} onClick={() => { const saved={...draft,message:draft.message.trim()};save({ ...prefs,customRules:prefs.customRules.some(rule=>rule.id===draft.id)?prefs.customRules.map(rule=>rule.id===draft.id?saved:rule):[...prefs.customRules,saved] }); setDraft(null) }}>保存</button></div></div>}
  </div>
}
