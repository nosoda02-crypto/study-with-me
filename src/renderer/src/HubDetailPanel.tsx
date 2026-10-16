import { useEffect, useRef, useState } from 'react'
import type { SettingsDetail } from './DataPanel'
import SpriteSettingsPanel from './SpriteSettingsPanel'
import WindowSettingsPanel from './WindowSettingsPanel'
import NotificationSettingsPanel from './NotificationSettingsPanel'
import WorkStateSettingsPanel from './WorkStateSettingsPanel'

const params=new URLSearchParams(window.location.hash.split('?')[1]??'')
const initialDetail=(params.get('detail')??'window') as SettingsDetail
const direction=params.get('direction')==='left'?'left':'right'

export default function HubDetailPanel():React.JSX.Element{
  const [detail,setDetail]=useState<SettingsDetail>(initialDetail)
  const [phase,setPhase]=useState<'opening'|'open'|'closing'>('opening')
  const closeTimer=useRef<number|null>(null)
  const close=():void=>{
    if(closeTimer.current!==null)return
    window.api.beginHubDetailClose()
    setPhase('closing')
    closeTimer.current=window.setTimeout(()=>window.api.closeHubDetail(),260)
  }
  useEffect(()=>{
    const offReveal=window.api.onHubDetailReveal(()=>setPhase('open'))
    const offClose=window.api.onHubDetailCloseRequested(close)
    const off=window.api.onHubDetailChanged(next=>{if(closeTimer.current!==null)window.clearTimeout(closeTimer.current);closeTimer.current=null;setDetail(next);setPhase('open')})
    return()=>{if(closeTimer.current!==null)window.clearTimeout(closeTimer.current);offReveal();offClose();off()}
  },[])
  const title=detail==='sprites'?'贴图库':detail==='window'?'大小与透明度':detail==='states'?'状态管理':'提醒与报时'
  return <div className={`hub-detail-window hub-detail-window--${direction} hub-detail-window--${phase}`}>
    <aside className="hub-detail-sheet" aria-label="设置延伸面板">
      <div className="hub-split-handle" role="separator" aria-label="调整主界面与侧栏占比" aria-orientation="vertical" onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);window.api.resizeHubSplit(event.screenX)}} onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))window.api.resizeHubSplit(event.screenX)}} onPointerUp={event=>event.currentTarget.releasePointerCapture(event.pointerId)} />
      <header className="extension-header"><button className="extension-close" aria-label="关闭侧滑设置" title="收起侧滑窗口" onPointerDown={event=>event.stopPropagation()} onClick={close}><span /></button><div><strong>{title}</strong><span>设置与数据</span></div></header>
      <div className="extension-body">{detail==='sprites'?<SpriteSettingsPanel/>:detail==='window'?<WindowSettingsPanel/>:detail==='states'?<WorkStateSettingsPanel/>:<NotificationSettingsPanel/>}</div>
    </aside>
  </div>
}
