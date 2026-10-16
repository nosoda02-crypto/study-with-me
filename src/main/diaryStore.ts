import { app } from 'electron'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import Store from './cachedStore'

/** What the renderer and backups see: images are always data URLs. */
export interface DiaryEntry {
  text: string
  images: string[]
}

export interface DiarySchema {
  entries: Record<string, DiaryEntry>
  font: string
}

const store = new Store<DiarySchema>({
  name: 'diary',
  defaults: {
    entries: {},
    font: 'default'
  }
})

export function getFont(): string {
  return store.get('font')
}

export function setFont(font: string): void {
  store.set('font', font)
}

export { todayStr } from '../shared/date'

// On disk, images live as content-addressed files in diary-images/ and entries
// hold `diary-image:<file>` references, so the diary JSON stays small instead
// of carrying every photo ever added. Older entries may still hold data URLs;
// both forms are read transparently and data URLs are moved out on save.
const REF_PREFIX = 'diary-image:'
const DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,(.*)$/
const MIME_BY_EXT: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

function imagesDir(): string {
  const dir = join(app.getPath('userData'), 'diary-images')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function toStoredImage(image: string): string {
  const match = DATA_URL.exec(image)
  if (!match) return image
  const buffer = Buffer.from(match[2], 'base64')
  const file = `${createHash('sha256').update(buffer).digest('hex').slice(0, 32)}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`
  const target = join(imagesDir(), file)
  if (!existsSync(target)) writeFileSync(target, buffer)
  return REF_PREFIX + file
}

function toDataUrl(image: string): string | null {
  if (!image.startsWith(REF_PREFIX)) return image
  const file = image.slice(REF_PREFIX.length), target = join(imagesDir(), file)
  if (!/^[a-f0-9]{32}\.(png|jpg|webp|gif)$/.test(file) || !existsSync(target)) return null
  return `data:${MIME_BY_EXT[file.split('.')[1]]};base64,${readFileSync(target).toString('base64')}`
}

const inflate = (entry: DiaryEntry): DiaryEntry => ({ text: entry.text, images: entry.images.flatMap(image => toDataUrl(image) ?? []) })

/** Delete image files no entry references any more. */
function collectGarbage(entries: Record<string, DiaryEntry>): void {
  const used = new Set(Object.values(entries).flatMap(entry => entry.images.filter(image => image.startsWith(REF_PREFIX)).map(image => image.slice(REF_PREFIX.length))))
  for (const file of readdirSync(imagesDir())) if (!used.has(file)) unlinkSync(join(imagesDir(), file))
}

function writeEntries(entries: Record<string, DiaryEntry>): void {
  store.set('entries', entries)
  collectGarbage(entries)
}

export function getEntry(date: string): DiaryEntry {
  const entry = store.get('entries')[date]
  return entry ? inflate(entry) : { text: '', images: [] }
}

export function saveEntry(date: string, entry: DiaryEntry): void {
  const entries = store.get('entries')
  entries[date] = { text: entry.text, images: entry.images.map(toStoredImage) }
  writeEntries(entries)
}

/** Move images still embedded in the diary JSON out to files (one-time, idempotent). */
export function migrateDiaryImages(): void {
  const entries = store.get('entries')
  if (!Object.values(entries).some(entry => entry.images.some(image => DATA_URL.test(image)))) return
  for (const entry of Object.values(entries)) entry.images = entry.images.map(toStoredImage)
  writeEntries(entries)
}

/** Backup form keeps the original self-contained shape (data URLs inline). */
export function getDiaryBackup(): DiarySchema {
  const data = store.store
  return { ...data, entries: Object.fromEntries(Object.entries(data.entries).map(([date, entry]) => [date, inflate(entry)])) }
}

export function replaceDiaryBackup(data: DiarySchema): void {
  const entries = Object.fromEntries(Object.entries(data.entries).map(([date, entry]) => [date, { text: entry.text, images: entry.images.map(toStoredImage) }]))
  store.store = { ...data, entries }
  collectGarbage(entries)
}

export function deleteEntry(date: string): void {
  const entries = store.get('entries')
  delete entries[date]
  writeEntries(entries)
}

export default store
