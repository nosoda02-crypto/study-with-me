import { useEffect, useState, type CSSProperties } from 'react'
import type { StatusWindowLayout } from '../../preload'
import { bubbleBaseHeight, type PanelPreferences } from '../../shared/appearance'
import CatView from './CatView'
import HubPanel from './HubPanel'
import StatusPanel from './StatusPanel'
import NotifyPanel from './NotifyPanel'
import HubDetailPanel from './HubDetailPanel'

function App(): React.JSX.Element {
  useEffect(() => {
    const applyAccent = (color: string) => {
      const css=document.documentElement.style
      css.setProperty('--accent-base',color)
      css.setProperty('--blue',color)
      const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16))
      const luminance=(rgb[0]*299+rgb[1]*587+rgb[2]*114)/1000
      css.setProperty('--accent-contrast',luminance>155?'#24262b':'#ffffff')
    }
    const apply = (s: PanelPreferences & { opacity: number }) => {
      const css = document.documentElement.style
      const singleSurface=!window.location.hash||window.location.hash==='#/hover-card'
      css.setProperty('--pet-opacity', String(s.opacity))
      css.setProperty('--panel-opacity', String(singleSurface?(s.singleOpacity??s.panelOpacity??1):1))
      css.setProperty('--panel-font-scale', String(s.panelFontScale ?? 1))
      css.setProperty('--panel-scale', String(singleSurface?(s.singleScale??s.panelScale??1):1))
      css.setProperty('--notification-scale',String(s.notificationScale??1))
      css.setProperty('--bubble-height', `${bubbleBaseHeight(s.panelFontScale ?? 1) - 20}px`)
    }
    window.api.getWindowSettings().then(apply)
    window.api.getAccentColor().then(applyAccent)
    const offSettings=window.api.onWindowSettingsUpdated(apply)
    const offAccent=window.api.onAccentColorUpdated(applyAccent)
    return () => { offSettings();offAccent() }
  }, [])
  if(window.location.hash.startsWith('#/hub-detail'))return <HubDetailPanel />
  switch (window.location.hash) {
    case '#/hub':
      return <HubPanel />
    case '#/hover-card':
      return <StatusBubbleView />
    case '#/notify':
      return <NotifyPanel />
    default:
      return <CatView />
  }
}

function StatusBubbleView(): React.JSX.Element {
  const [layout, setLayout] = useState<StatusWindowLayout>({ bubbleBelow: false, placement:'above', tipLeft: 160, tipTop:40, bubbleScale: 1 })
  useEffect(() => window.api.onStatusLayout(setLayout), [])
  return <div className={`pet-bubble-window pet-bubble-window--${layout.placement??(layout.bubbleBelow?'below':'above')}`} style={{ '--bubble-tip-left': `${layout.tipLeft}px`, '--bubble-tip-top':`${layout.tipTop??40}px`, '--panel-scale': String(layout.bubbleScale) } as CSSProperties}><StatusPanel /></div>
}

export default App
