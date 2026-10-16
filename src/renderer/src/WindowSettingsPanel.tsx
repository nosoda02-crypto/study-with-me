import { useEffect, useState } from 'react'
import { PANEL_DEFAULTS, PANEL_LIMITS, type PanelPreferences } from '../../shared/appearance'
export default function WindowSettingsPanel(): React.JSX.Element {
  const [settings, setSettings] = useState({ scale: 1, opacity: 1, ...PANEL_DEFAULTS })
  useEffect(() => {
    const refresh = () => { window.api.getWindowSettings().then(setSettings) }
    refresh()
    const off = window.api.onDataImported(refresh), updated = window.api.onWindowSettingsUpdated(setSettings)
    return () => { off(); updated() }
  }, [])
  const slider = (key: 'scale' | 'opacity' | keyof PanelPreferences, label: string, min: number, max: number) => <div className="slider-row" key={key}><div className="slider-label-row"><span>{label}</span><span className="slider-value">{Math.round(settings[key] * 100)}%</span></div><input aria-label={label} type="range" min={min} max={max} step="0.05" value={settings[key]} onChange={e => {
    const value = Number(e.target.value); setSettings(s => ({ ...s, [key]: value }))
    if (key === 'scale') window.api.setWindowScale(value)
    else if (key === 'opacity') window.api.setWindowOpacity(value)
    else window.api.setPanelPreference(key, value)
  }} /></div>
  return <div className="window-settings-panel embedded-settings-panel"><h1>人物与界面</h1><p className="sprite-hint">三类界面分别调整。完整手帐可直接拖动窗口边角改变大小。</p><h3 className="settings-section">桌宠人物</h3>{slider('scale','人物大小',.5,2)}{slider('opacity','人物透明度',.2,1)}<h3 className="settings-section">单击信息气泡</h3>{slider('singleScale','单击界面大小',...PANEL_LIMITS.singleScale)}{slider('singleOpacity','单击界面透明度',...PANEL_LIMITS.singleOpacity)}<h3 className="settings-section">双击完整手帐</h3>{slider('hubOpacity','双击界面透明度',...PANEL_LIMITS.hubOpacity)}<small className="settings-resize-hint">大小请拖动完整手帐的窗口边角；打开侧栏后可拖动中间分隔线调整占比。</small><h3 className="settings-section">消息弹窗</h3>{slider('notificationScale','弹窗大小',...PANEL_LIMITS.notificationScale)}{slider('notificationOpacity','弹窗透明度',...PANEL_LIMITS.notificationOpacity)}<h3 className="settings-section">文字</h3>{slider('panelFontScale','界面字体大小',...PANEL_LIMITS.panelFontScale)}</div>
}
