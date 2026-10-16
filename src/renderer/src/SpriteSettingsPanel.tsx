import { Fragment, useEffect, useRef, useState } from 'react'
import type { SpriteKey, SpriteMap, UserSpriteItem } from '../../preload'
import type { WorkStateDefinition } from '../../shared/workStates'

type Pose =
  | 'idle'
  | 'sleep'
  | 'notifyIcon'

const DEFAULT_IMAGES: Record<Pose, string> = {
  idle: './cat/idle.svg',
  sleep: './cat/sleep.svg',
  notifyIcon: './cat/notifyIcon.svg'
}

const POSE_LABELS: Record<Pose, string> = {
  idle: '待机（工作中显示）',
  sleep: '通用默认图',
  notifyIcon: '默认头像'
}

const NOTIFY_POSES: Pose[] = ['notifyIcon']

function SpritePoseRow({
  pose,
  label,
  description,
  defaultUrl,
  customUrl,
  inheritedUrl,
  inheritedNote,
  library,
  choosing,
  onChoose,
  onUpload,
  onUseLibrary,
  onReset
}: {
  pose: SpriteKey
  label?: string
  /** One line under the title explaining when this image is shown. */
  description?: string
  defaultUrl?: string
  customUrl?: string
  /** Image actually shown when this key has none of its own, and the note explaining where it comes from. */
  inheritedUrl?: string
  inheritedNote?: string
  library: UserSpriteItem[]
  choosing: boolean
  onChoose: (pose: SpriteKey | null) => void
  onUpload: (pose: SpriteKey) => void
  onUseLibrary: (pose: SpriteKey, id: string) => void
  onReset: (pose: SpriteKey) => void
}): React.JSX.Element {
  const title = label ?? POSE_LABELS[pose as Pose]
  return (
    <div className={`sprite-row-wrap${choosing ? ' choosing' : ''}`}>
      <div className="sprite-row">
        <img className="sprite-preview" src={customUrl ?? inheritedUrl ?? defaultUrl ?? DEFAULT_IMAGES[pose as Pose]} alt="" />
        <div className="sprite-row-body">
          <span className="sprite-row-label">{title}{!customUrl && inheritedNote && <small className="sprite-row-note">{inheritedNote}</small>}</span>
          {description && <span className="sprite-row-desc">{description}</span>}
          <div className="sprite-row-actions">
            <button aria-expanded={choosing} onClick={() => onChoose(choosing ? null : pose)}>选择图片…</button>
            <button className="ghost" disabled={!customUrl} onClick={() => onReset(pose)}>
              恢复默认
            </button>
          </div>
        </div>
      </div>
      {choosing && <div className="sprite-pose-picker" aria-label={`为「${title}」选择贴图`}>
        {library.length > 0
          ? <div className="sprite-pose-picker-grid">{library.map(item => <button key={item.id} title={item.name} aria-label={`使用 ${item.name}`} onClick={() => onUseLibrary(pose, item.id)}><img src={item.url} alt="" /><span>{item.name}</span></button>)}</div>
          : <p className="sprite-library-empty">贴图库还是空的</p>}
        <div className="sprite-pose-picker-actions"><button onClick={() => onChoose(null)}>取消</button><button className="primary-button" onClick={() => onUpload(pose)}>从电脑上传…</button></div>
      </div>}
    </div>
  )
}

function SpriteSettingsPanel({ embedded = false, onClose }: { embedded?: boolean; onClose?: () => void } = {}): React.JSX.Element {
  const [sprites, setSprites] = useState<SpriteMap>({})
  const [workStates, setWorkStates] = useState<WorkStateDefinition[]>([])
  const [library,setLibrary]=useState<UserSpriteItem[]>([])
  const [tags,setTags]=useState<string[]>([])
  const [selectedTags,setSelectedTags]=useState<string[]>([])
  const [editing,setEditing]=useState<UserSpriteItem|null>(null)
  const [pendingDelete,setPendingDelete]=useState<string|null>(null)
  const [choosingPose,setChoosingPose]=useState<SpriteKey|null>(null)
  const [tagText,setTagText]=useState('')
  const [managingTags,setManagingTags]=useState(false)
  const [tagDrafts,setTagDrafts]=useState<Record<string,string|null>>({})
  const [newTag,setNewTag]=useState('')
  const [tagsExpanded,setTagsExpanded]=useState(false)
  const [tagsOverflowing,setTagsOverflowing]=useState(false)
  const tagFilterRef=useRef<HTMLDivElement>(null)
  const refreshLibrary=()=>Promise.all([window.api.getUserSprites(),window.api.getUserSpriteTags()]).then(([items,availableTags])=>{setLibrary(items);setTags(availableTags)})

  useEffect(() => {
    window.api.getSprites().then(setSprites)
    return window.api.onSpritesUpdated(setSprites)
  }, [])
  useEffect(() => {
    const loadStates = () => { window.api.getWorkStates().then(setWorkStates) }
    loadStates()
    // Saving the state list broadcasts a work-state update; pick up renamed/added states.
    return window.api.onWorkStateUpdated(loadStates)
  }, [])

  useEffect(() => {
    refreshLibrary()
  }, [])

  useEffect(()=>{
    const node=tagFilterRef.current
    if(!node)return
    const measure=()=>{const rows=new Set(Array.from(node.querySelectorAll('button')).map(button=>(button as HTMLElement).offsetTop));setTagsOverflowing(rows.size>3)}
    measure();const observer=new ResizeObserver(measure);observer.observe(node)
    return()=>observer.disconnect()
  },[tags])

  const handlePick = async (pose: SpriteKey): Promise<void> => {
    const dataUrl = await window.api.pickSprite(pose)
    if (dataUrl) { setSprites((prev) => ({ ...prev, [pose]: dataUrl }));setChoosingPose(null);await refreshLibrary() }
  }
  const useLibraryForPose = async (pose: SpriteKey, id: string): Promise<void> => {
    const dataUrl = await window.api.applyUserSpriteToPose(id, pose)
    if (dataUrl) { setSprites((prev) => ({ ...prev, [pose]: dataUrl }));setChoosingPose(null) }
  }

  const handlePickStatic = async (): Promise<void> => {
    const updated = await window.api.pickStaticSprite()
    if (updated) { setSprites((prev) => ({ ...prev, ...updated }));await refreshLibrary() }
  }

  const applyUser=async(id:string,target:'cat'|'notify')=>{const updated=await window.api.applyUserSprite(id,target);if(updated)setSprites(prev=>({...prev,...updated}))}
  const visibleLibrary=library.filter(item=>selectedTags.every(tag=>item.tags.includes(tag)))
  const parseTags=(value:string)=>[...new Set(value.split(/[\s,，#]+/).map(tag=>tag.trim()).filter(Boolean))]
  const toggleFilterTag=(tag:string)=>setSelectedTags(current=>current.includes(tag)?current.filter(value=>value!==tag):[...current,tag])
  const toggleEditorTag=(tag:string)=>{
    const current=parseTags(tagText)
    const next=current.includes(tag)?current.filter(value=>value!==tag):[...current,tag]
    setTagText(next.map(value=>`#${value}`).join(' '))
  }
  const beginTagManagement=()=>{setTagDrafts(Object.fromEntries(tags.map(tag=>[tag,tag])));setNewTag('');setManagingTags(true)}
  const addManagedTag=()=>{const tag=newTag.replace(/^#+/,'').trim();if(!tag)return;setTagDrafts(current=>({...current,[tag]:tag}));setNewTag('')}
  const saveManagedTags=async()=>{
    const remap=(tag:string)=>{const draft=tagDrafts[tag];return draft===null?'':(draft??tag).replace(/^#+/,'').trim()}
    await Promise.all(library.map(item=>{const next=[...new Set(item.tags.map(remap).filter(Boolean))];return next.join('\0')===item.tags.join('\0')?Promise.resolve(null):window.api.updateUserSprite(item.id,{tags:next})}))
    const preferences=await window.api.getNotificationPreferences()
    const randomIconTags=[...new Set(preferences.randomIconTags.map(remap).filter(Boolean))]
    if(randomIconTags.join('\0')!==preferences.randomIconTags.join('\0'))await window.api.setNotificationPreferences({...preferences,randomIconTags})
    setSelectedTags(current=>[...new Set(current.map(remap).filter(Boolean))])
    await window.api.setUserSpriteTags([...new Set(Object.values(tagDrafts).filter((tag):tag is string=>typeof tag==='string').map(tag=>tag.replace(/^#+/,'').trim()).filter(Boolean))])
    await refreshLibrary();setManagingTags(false)
  }

  const handleReset = async (pose: SpriteKey): Promise<void> => {
    await window.api.resetSprite(pose)
    setSprites((prev) => {
      const next = { ...prev }
      delete next[pose]
      return next
    })
  }

  const spriteEditor=editing&&<div className="sprite-library-editor" aria-label="贴图标签编辑器"><strong>整理「{editing.name}」</strong><label>名称<input value={editing.name} placeholder="贴图名称" onChange={e=>setEditing({...editing,name:e.target.value})}/></label><label>自定义标签<input aria-label="贴图标签" value={tagText} placeholder="#全职高手 #黄少天" onChange={e=>setTagText(e.target.value)}/></label>{tags.length>0&&<div className="sprite-tag-suggestions" aria-label="选择已有标签">{tags.map(tag=><button key={tag} type="button" aria-pressed={parseTags(tagText).includes(tag)} className={parseTags(tagText).includes(tag)?'selected':''} onClick={()=>toggleEditorTag(tag)}>#{tag}</button>)}</div>}<small>可直接点选已有标签，也可以输入新标签；用空格、逗号或 # 分隔。</small><div><button onClick={()=>setEditing(null)}>取消</button><button className="primary-button" onClick={async()=>{const updated=await window.api.updateUserSprite(editing.id,{name:editing.name,tags:parseTags(tagText)});if(updated)await refreshLibrary();setEditing(null)}}>保存标签</button></div></div>

  // Focus uses the idle image; every other state can have its own image and
  // otherwise shows the rest image (which itself falls back to the idle image).
  const restUrl = sprites.sleep ?? sprites.idle
  const usingRest = workStates.filter(state => state.id !== 'focus' && !sprites[`state-${state.id}`]).map(state => state.label)
  const restDescription = usingRest.length ? `没单独选图的状态都显示这张，目前用于：${usingRest.join('、')}` : '所有状态都已单独选图，暂时没有状态用到这张'
  const stateRows: { key: SpriteKey; label: string; inherited?: string; note?: string; fallback: string }[] = [
    ...(workStates.some(state => state.id === 'focus') ? [] : [{ key: 'idle' as SpriteKey, label: '待机', fallback: DEFAULT_IMAGES.idle }]),
    ...workStates.map(state => state.id === 'focus'
      ? { key: 'idle' as SpriteKey, label: `${state.label}（待机图）`, fallback: DEFAULT_IMAGES.idle }
      : { key: `state-${state.id}` as SpriteKey, label: state.label, inherited: restUrl, note: '跟随通用图', fallback: DEFAULT_IMAGES.sleep })
  ]

  return (
    <div className={`sprite-settings-panel${embedded ? ' embedded-settings-panel' : ''}`}>
      <h1>更换贴图</h1>
      <p className="sprite-hint">选好后桌宠窗口会实时更新，不用重启 App。</p>
      <div className="sprite-scroll">

        {(library.length>0||tags.length>0)&&<section className="user-sprite-library"><div className="sprite-library-heading"><div className="sprite-section-title">贴图库</div><button className="text-button" onClick={beginTagManagement}>编辑</button></div>{managingTags&&<div className="sprite-tag-manager" aria-label="管理贴图库标签"><strong>编辑标签栏目</strong><div className="sprite-tag-add"><input aria-label="新标签名称" value={newTag} placeholder="输入新标签" onChange={event=>setNewTag(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();addManagedTag()}}}/><button type="button" disabled={!newTag.trim()} onClick={addManagedTag}>＋ 添加</button></div>{Object.keys(tagDrafts).map(tag=><label key={tag} className={tagDrafts[tag]===null?'is-removed':''}><button className="tag-remove" type="button" aria-label={`${tagDrafts[tag]===null?'恢复':'删除'}标签 ${tag}`} onClick={()=>setTagDrafts(current=>({...current,[tag]:current[tag]===null?tag:null}))}>{tagDrafts[tag]===null?'↶':'−'}</button><span>#</span><input aria-label={`编辑标签 ${tag}`} disabled={tagDrafts[tag]===null} value={tagDrafts[tag]??tag} onChange={event=>setTagDrafts(current=>({...current,[tag]:event.target.value}))}/></label>)}<small>新增标签会保留在栏目中；改名或删除会同步所有贴图和消息随机池。</small><div><button onClick={()=>setManagingTags(false)}>取消</button><button className="primary-button" onClick={()=>void saveManagedTags()}>完成</button></div></div>}<div ref={tagFilterRef} className={`sprite-tag-filter${tagsExpanded?' expanded':' collapsed'}`} aria-label="贴图标签筛选"><button className={!selectedTags.length?'selected':''} onClick={()=>setSelectedTags([])}>全部</button>{tags.map(tag=><button key={tag} aria-pressed={selectedTags.includes(tag)} className={selectedTags.includes(tag)?'selected':''} onClick={()=>toggleFilterTag(tag)}>#{tag}</button>)}</div>{tagsOverflowing&&<button className="sprite-tag-filter-toggle" aria-label={tagsExpanded?'收起标签':'展开全部标签'} aria-expanded={tagsExpanded} onClick={()=>setTagsExpanded(value=>!value)}>{tagsExpanded?'⌃':'⌄'}</button>}<div className="user-sprite-grid">{visibleLibrary.map(item=><Fragment key={item.id}><div className="user-sprite-cell"><article className="user-sprite-card"><img src={item.url} alt=""/><div><strong>{item.name}</strong><small>{item.tags.length?item.tags.map(tag=>`#${tag}`).join(' '):'暂无标签'}</small></div><div className="user-sprite-actions"><button onClick={()=>applyUser(item.id,'cat')}>设为桌宠</button><button onClick={()=>applyUser(item.id,'notify')}>设为消息图标</button><button onClick={()=>{setEditing({...item});setTagText(item.tags.map(tag=>`#${tag}`).join(' '))}}>编辑标签</button><button className="danger" aria-label={`删除贴图 ${item.name}`} onClick={()=>setPendingDelete(item.id)}>删除</button></div>{pendingDelete===item.id&&<div className="user-sprite-delete-confirm" role="group" aria-label="确认删除贴图"><span>从贴图库删除？</span><button onClick={()=>setPendingDelete(null)}>取消</button><button className="danger" onClick={async()=>{await window.api.deleteUserSprite(item.id);setPendingDelete(null);if(editing?.id===item.id)setEditing(null);await refreshLibrary()}}>删除</button></div>}</article>{editing?.id===item.id&&spriteEditor}</div></Fragment>)}</div>{!visibleLibrary.length&&<p className="sprite-library-empty">没有同时包含这些标签的贴图</p>}</section>}

      <div className="sprite-static-row">
        <button onClick={handlePickStatic}>添加一张贴图…</button>
        <span className="sprite-hint sprite-hint-inline">
          新图片会收藏到贴图库，并同时设为桌宠的待机与休息姿态
        </span>
      </div>
        <div className="sprite-section-title">状态贴图（每个状态可以用不同的图）</div>
        <div className="sprite-rows">
          {stateRows.map(({ key, label, inherited, note, fallback }) => (
            <SpritePoseRow key={key} pose={key} label={label} defaultUrl={fallback} customUrl={sprites[key]} inheritedUrl={inherited} inheritedNote={note} library={library} choosing={choosingPose === key} onChoose={setChoosingPose} onUpload={handlePick} onUseLibrary={useLibraryForPose} onReset={handleReset} />
          ))}
        </div>

        <div className="sprite-section-title">其他状态的通用图</div>
        <div className="sprite-rows">
          {(() => { const key: SpriteKey = 'sleep'; return <SpritePoseRow pose={key} label="通用默认图" description={restDescription} customUrl={sprites.sleep} inheritedUrl={sprites.idle} inheritedNote="跟随待机图" library={library} choosing={choosingPose === key} onChoose={setChoosingPose} onUpload={handlePick} onUseLibrary={useLibraryForPose} onReset={handleReset} /> })()}
        </div>

        <div className="sprite-section-title">消息弹窗</div>
        <div className="sprite-rows">
          {NOTIFY_POSES.map((key) => (
            <SpritePoseRow key={key} pose={key} label="默认头像" description="桌宠弹出提醒时左边的小图。在「提醒与报时」里给消息单独指定了图片的，优先用那张。" customUrl={sprites[key]} library={library} choosing={choosingPose === key} onChoose={setChoosingPose} onUpload={handlePick} onUseLibrary={useLibraryForPose} onReset={handleReset} />
          ))}
        </div>
      </div>

      {!embedded && <button className="close-btn" onClick={() => onClose?.() ?? window.api.closeCurrentWindow()}>关闭</button>}
    </div>
  )
}

export default SpriteSettingsPanel
