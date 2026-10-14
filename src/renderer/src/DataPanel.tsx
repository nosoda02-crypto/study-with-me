import type { ThemeMode } from '../../preload'
import { ACCENT_PRESETS, DEFAULT_ACCENT_COLOR } from '../../shared/appearance'
import { flushDiaryDraft } from './diaryDraft'
import { useEffect, useState } from 'react'
export type SettingsDetail = 'sprites' | 'window' | 'notifications' | 'states'
export default function DataPanel({ onOpenDetail }: { onOpenDetail: (detail: SettingsDetail) => void }): React.JSX.Element {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>('system')
  const [accent, setAccent] = useState(DEFAULT_ACCENT_COLOR)
  const [startupEnabled,setStartupEnabled]=useState(false)
  const [startupBusy,setStartupBusy]=useState(false)
  useEffect(() => {
    window.api.getAppearance().then(setTheme)
    window.api.getAccentColor().then(setAccent)
    window.api.getStartupEnabled().then(setStartupEnabled)
    const offTheme=window.api.onAppearanceUpdated(setTheme)
    const offAccent=window.api.onAccentColorUpdated(setAccent)
    return () => { offTheme();offAccent() }
  }, [])
  async function changeTheme(mode: ThemeMode) {
    try { await window.api.setAppearance(mode); setTheme(mode) }
    catch { setMessage('外观切换失败，请重试') }
  }
  async function changeAccent(color: string) {
    try { setAccent(await window.api.setAccentColor(color)) }
    catch { setMessage('颜色切换失败，请重试') }
  }
  async function transfer(importing: boolean) {
    setBusy(true); setMessage('')
    try {
      await flushDiaryDraft()
      const result = importing ? await window.api.importBackup() : await window.api.exportBackup()
      if (result) setMessage(importing ? '导入完成，记录已暂停。' : `备份已导出：${result}`)
    } catch (error) { setMessage(`操作失败：${error instanceof Error ? error.message : '请重试'}`) }
    finally { setBusy(false) }
  }
  async function changeStartup():Promise<void>{
    if(startupBusy)return
    setStartupBusy(true);setMessage('')
    try{const enabled=await window.api.setStartupEnabled(!startupEnabled);setStartupEnabled(enabled);setMessage(enabled?'已加入系统登录项。':'已关闭开机自动启动。')}
    catch{setMessage('开机启动设置失败，请重试')}
    finally{setStartupBusy(false)}
  }
  return <section className="glass-view settings-view"><div className="glass-view-header"><div><h2>随你的心意</h2><p className="view-subtitle">外观、偏好与每一份记录。</p></div></div>
    <div className="appearance-group"><span className="section-caption">外观</span><div className="appearance-options" aria-label="外观模式">{([['light', '☀', '浅色'], ['dark', '☾', '深色'], ['system', '◐', '跟随系统']] as const).map(([mode, icon, label]) => <button key={mode} aria-pressed={theme === mode} className={theme === mode ? 'selected' : ''} onClick={() => changeTheme(mode)}><span>{icon}</span>{label}</button>)}</div></div>
    <div className="accent-group"><span className="section-caption">基础色</span><div className="accent-swatches" aria-label="界面基础色">{ACCENT_PRESETS.map(item=><button key={item.color} aria-label={item.label} aria-pressed={accent===item.color} className={accent===item.color?'selected':''} style={{'--swatch':item.color} as React.CSSProperties} onClick={()=>changeAccent(item.color)}><span /></button>)}<label className="accent-picker" aria-label="自选颜色"><input type="color" value={accent} onChange={e=>changeAccent(e.target.value)}/><span>＋</span></label></div><p>颜色会用于按钮、选中状态和界面的轻微染色。</p></div>
    <div className="settings-group"><button className="settings-link" onClick={() => onOpenDetail('sprites')}><span>✧　桌宠与贴图</span><span>›</span></button>
      <button className="settings-link" onClick={() => onOpenDetail('window')}><span>◫　大小与透明度</span><span>›</span></button>
      <button className="settings-link" onClick={() => onOpenDetail('states')}><span>◌　状态管理</span><span>›</span></button>
      <button className="settings-link" onClick={() => onOpenDetail('notifications')}><span>◉　提醒与报时</span><span>›</span></button></div>
    <h3 className="section-caption">启动方式</h3><div className="settings-group startup-group"><div><strong>开机自动启动</strong><small>登录电脑后自动打开桌宠，无需再通过终端启动。</small></div><button type="button" aria-label="开机自动启动" aria-pressed={startupEnabled} disabled={startupBusy} className={`notice-rule-toggle${startupEnabled?' on':''}`} onClick={changeStartup}/></div>
    <h3 className="section-caption">数据备份</h3><div className="settings-group backup-group"><h3>把陪伴好好收藏</h3><p>导出任务、日记与图片、累计统计、状态历史、设置和自定义桌宠。使用同一份文件即可恢复。</p>
      <div className="backup-actions"><button className="primary-button" disabled={busy} onClick={() => transfer(false)}>导出全部记录</button><button className="secondary-button" disabled={busy} onClick={() => transfer(true)}>导入备份</button></div></div>
    <p className="footnote">导入会替换现有数据，并自动保留导入前的恢复备份。</p>
    {message && <p className="transfer-message" role="status">{message}</p>}
  </section>
}
