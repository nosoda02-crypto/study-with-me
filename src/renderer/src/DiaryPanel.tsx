import { registerDiaryDraft } from './diaryDraft'
import { addDays } from '../../shared/date'
import { useEffect, useRef, useState } from 'react'

const FONT_OPTIONS: { value: string; label: string; family: string }[] = [
  { value: 'default', label: '楷体', family: "'STKaiti', 'Kaiti SC', 'Noto Serif SC', serif" },
  { value: 'serif', label: '衬线', family: "Georgia, 'Songti SC', serif" },
  { value: 'mono', label: '等宽', family: "'SF Mono', Menlo, Consolas, monospace" },
  {
    value: 'sans',
    label: '无衬线',
    family: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif"
  }
]

function fontFamilyFor(value: string): string {
  return FONT_OPTIONS.find((f) => f.value === value)?.family ?? FONT_OPTIONS[0].family
}

function DiaryPanel(): React.JSX.Element {
  const [today, setToday] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [text, setText] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [font, setFont] = useState('default')
  const [saved, setSaved] = useState(true)
  const [fontMenuOpen, setFontMenuOpen] = useState(false)
  const [lockSelected, setLockSelected] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const revision = useRef(0)
  const pending = useRef<{ date: string; text: string; images: string[] } | null>(null)
  const timer = useRef<number>()
  const saveQueue = useRef(Promise.resolve())
  const flush = (): Promise<void> => {
    clearTimeout(timer.current)
    const draft = pending.current
    if (!draft) return saveQueue.current
    pending.current = null
    const version = revision.current
    const saving = saveQueue.current.catch(() => {}).then(() => window.api.saveDiaryEntry(draft.date, { text: draft.text, images: draft.images }))
    saveQueue.current = saving
    return saving.then(() => { if (version === revision.current) { setSaved(true); setError('') } }).catch(() => {
      if (version === revision.current) pending.current = draft
      setError('保存失败，请重试'); throw new Error('日记尚未保存')
    })
  }
  const update = (nextText: string, nextImages: string[]): void => {
    revision.current++
    setText(nextText); setImages(nextImages); setSaved(false)
    pending.current = { date: selectedDate, text: nextText, images: nextImages }
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { flush().catch(() => {}) }, 400)
  }
  useEffect(() => registerDiaryDraft(flush))
  const navigate = async (delta: number): Promise<void> => {
    try { await flush(); setSelectedDate(addDays(selectedDate, delta)) } catch { /* Keep the draft visible. */ }
  }
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      if (pending.current) { event.preventDefault(); event.returnValue = ''; flush().catch(() => {}) }
    }
    window.addEventListener('beforeunload', beforeUnload)
    const off = window.api.onDataImported(() => {
      clearTimeout(timer.current); pending.current = null; revision.current++
      window.api.getDiaryEntry(selectedDate).then(entry => { setText(entry.text); setImages(entry.images); setSaved(true) })
      window.api.getDiaryFont().then(setFont)
    })
    return () => { window.removeEventListener('beforeunload', beforeUnload); off() }
  }, [selectedDate])

  useEffect(() => {
    Promise.all([window.api.getTodayKey(), window.api.getDiaryFont()]).then(([todayKey, savedFont]) => {
      setToday(todayKey)
      setSelectedDate(todayKey)
      setFont(savedFont)
    })
  }, [])

  useEffect(() => {
    if (!selectedDate) return
    let active = true
    setLoading(true)
    window.api.getDiaryEntry(selectedDate).then((entry) => {
      if (!active) return
      setText(entry.text)
      setImages(entry.images)
      setSaved(true); setLoading(false)
    }).catch(() => { if (active) setError('日记读取失败') })
    return () => { active = false }
  }, [selectedDate])

  const handleSave = async (): Promise<void> => {
    try { await flush() } catch { /* Error is shown inline. */ }
  }

  const handleAddImage = async (): Promise<void> => {
    try {
      const dataUrl = await window.api.pickDiaryImage()
      if (dataUrl) update(text, [...images, dataUrl])
    } catch { setError('图片未能添加，请重试') }
  }

  const handleRemoveImage = (index: number): void => {
    update(text, images.filter((_, i) => i !== index))
  }

  const handleFontChange = (value: string): void => {
    setFont(value)
    setFontMenuOpen(false)
    window.api.setDiaryFont(value)
  }

  const handleToggleLock = async (): Promise<void> => {
    if (lockSelected) {
      setLockSelected(false)
      return
    }
    try {
      await flush()
      setFontMenuOpen(false)
      setLockSelected(true)
    } catch { /* Keep the diary visible when its latest draft could not be saved. */ }
  }

  if (!selectedDate) return <div className="glass-view glass-view--diary" />

  const d = new Date(selectedDate + 'T00:00:00')
  const dayNumber = d.getDate()
  const monthWeekday = d
    .toLocaleDateString('zh-CN', { month: 'long', weekday: 'short' })
    .replace(',', '')

  return (
    <div className="glass-view glass-view--diary">
      <div className="diary-date-header">
        <button className="diary-nav-btn" aria-label="前一天" disabled={loading} onClick={() => navigate(-1)}>
          ‹
        </button>
        <div className="diary-date-display">
          <span className="diary-day-number">{dayNumber}</span>
          <span className="diary-month-weekday">
            {monthWeekday}
            {selectedDate === today && <span className="diary-today-badge">今天</span>}
          </span>
        </div>
        <button className="diary-nav-btn" aria-label="后一天" disabled={loading} onClick={() => navigate(1)}>
          ›
        </button>

        <button
          className={`diary-lock-btn${lockSelected ? ' selected' : ''}`}
          type="button"
          aria-label={lockSelected ? '取消日记上锁' : '给日记上锁'}
          aria-pressed={lockSelected}
          title={lockSelected ? '解锁并显示日记' : '模糊并锁定日记'}
          onClick={() => { void handleToggleLock() }}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d={lockSelected ? 'M6.2 8V6.4a3.8 3.8 0 0 1 7.1-1.9' : 'M6.2 8V6.4a3.8 3.8 0 0 1 7.6 0V8'} />
            <rect x="4.5" y="8" width="11" height="8.5" rx="2.3" />
            <circle cx="10" cy="12" r=".85" />
          </svg>
        </button>

        <div className="diary-font-wrap">
          <button className="diary-font-btn" onClick={() => setFontMenuOpen((v) => !v)}>
            字体
          </button>
          {fontMenuOpen && (
            <div className="diary-font-menu">
              {FONT_OPTIONS.map((f) => (
                <button
                  key={f.value}
                  className={`diary-font-menu-item${f.value === font ? ' diary-font-menu-item--active' : ''}`}
                  onClick={() => handleFontChange(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <p role="alert" className="error-message">{error}</p>}
      <textarea
        aria-label="日记正文"
        aria-hidden={lockSelected}
        disabled={loading || lockSelected}
        className={`diary-textarea${lockSelected ? ' diary-content-locked' : ''}`}
        style={{ fontFamily: fontFamilyFor(font) }}
        value={text}
        onChange={(e) => {
          update(e.target.value, images)
        }}
        placeholder="记录此刻的灵感……"
      />

      <div className={`diary-images${lockSelected ? ' diary-content-locked' : ''}`} aria-hidden={lockSelected}>
        {images.map((src, i) => (
          <div className="diary-image-thumb" key={i}>
            <img src={src} alt="" />
            <button className="diary-image-remove" disabled={lockSelected} onClick={() => handleRemoveImage(i)}>
              ×
            </button>
          </div>
        ))}
        <button className="diary-add-image" disabled={loading || lockSelected} onClick={handleAddImage}>
          + 贴图
        </button>
      </div>

      <div className="diary-footer">
        <span className="glass-save-hint">{saved ? '已保存' : '正在保存…'}</span>
        <button className="glass-save-btn" disabled={lockSelected} onClick={handleSave}>
          保存
        </button>
      </div>
    </div>
  )
}

export default DiaryPanel
