import { useEffect, useState, type CSSProperties } from 'react'
import type { NotifyWindowLayout } from '../../preload'

interface NotifyPayload {
  title: string
  message: string
  icon?: string
}

function NotifyPanel(): React.JSX.Element {
  const [payload, setPayload] = useState<NotifyPayload | null>(null)
  const [icon, setIcon] = useState('./cat/notifyIcon.svg')
  const [location, setLocation] = useState<'pet' | 'top-right'>('pet')
  const [layout,setLayout]=useState<NotifyWindowLayout>({placement:'above',tipLeft:164,tipTop:55})

  useEffect(() => {
    document.documentElement.classList.add('notify-document')
    window.api.getSprites().then((sprites) => {
      if (sprites.notifyIcon) setIcon(sprites.notifyIcon)
    })
    const offNotify = window.api.onNotifyShow(next => { setPayload(next);if(next.icon)setIcon(next.icon);else window.api.getSprites().then(s=>setIcon(s.notifyIcon??'./cat/notifyIcon.svg')); window.api.getNotificationPreferences().then(p => setLocation(p.location)) })
    const offSprites = window.api.onSpritesUpdated(s => setIcon(s.notifyIcon ?? './cat/notifyIcon.svg'))
    const offLayout=window.api.onNotifyLayout(setLayout)
    return () => { document.documentElement.classList.remove('notify-document'); offNotify(); offSprites();offLayout() }
  }, [])

  if (!payload) return <div className="notify-card notify-card--empty" />

  return (
    <div className={`notify-card notify-card--${location} notify-card--${layout.placement}`} style={{'--notify-tip-left':`${layout.tipLeft}px`,'--notify-tip-top':`${layout.tipTop}px`} as CSSProperties}>
      <button className="notify-close" onClick={() => window.api.closeNotify()}>
        ×
      </button>
      <img className="notify-icon" src={icon} draggable={false} alt="" />
      <div className="notify-text">
        <h4 className="notify-title">{payload.title}</h4>
        <p className="notify-message">{payload.message}</p>
      </div>
    </div>
  )
}

export default NotifyPanel
