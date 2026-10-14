import { flushDiaryDraft } from './diaryDraft'
import { useEffect, useState } from 'react'
import TasksPanel from './TasksPanel'
import DiaryPanel from './DiaryPanel'
import DataPanel, { type SettingsDetail } from './DataPanel'
import CheckinPanel from './CheckinPanel'
import StudyPanel from './StudyPanel'

type Tab = 'tasks'|'study'|'checkin'|'diary'|'settings'
export default function HubPanel(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('tasks')
  const [detailDirection,setDetailDirection]=useState<'left'|'right'|null>(null)
  const openDetail = async (next: SettingsDetail): Promise<void> => {
    setTab('settings')
    await window.api.openHubDetail(next)
  }
  useEffect(() => window.api.onHubOpenDetail(openDetail), [])
  useEffect(()=>window.api.onHubDetailState(setDetailDirection),[])
  return <div className={`hub-window${detailDirection?` hub-window--joined-${detailDirection}`:''}`}>
    <main className="hub-primary">
    <header className="hub-toolbar"><div className="window-controls"><button aria-label="关闭手帐" onClick={async () => { try { await flushDiaryDraft(); window.api.closeCurrentWindow() } catch { setTab('diary') } }} /></div>
      <span>陪伴手帐</span><span className="toolbar-mark">✦</span></header>
    <nav className="segmented-control" aria-label="手帐导航">{([['tasks','任务'],['study','学习打卡'],['checkin','统计'],['diary','日记'],['settings','设置']] as const).map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} aria-pressed={tab === id} onClick={() => {setTab(id);if(id!=='settings')window.api.requestHubDetailClose()}}>{label}</button>)}</nav>
    <div className="hub-content-area">
      <div className="tab-page" hidden={tab !== 'tasks'}><TasksPanel /></div>
      <div className="tab-page" hidden={tab !== 'study'}><StudyPanel /></div>
      <div className="tab-page" hidden={tab !== 'checkin'}><CheckinPanel /></div>
      <div className="tab-page" hidden={tab !== 'diary'}><DiaryPanel /></div>
      <div className="tab-page" hidden={tab !== 'settings'}><DataPanel onOpenDetail={openDetail} /></div>
    </div>
    </main>
  </div>
}
