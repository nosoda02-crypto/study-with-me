import { app } from 'electron'
import Store from './cachedStore'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, copyFileSync, readFileSync, readdirSync, unlinkSync, rmSync, writeFileSync, statSync } from 'fs'
import { join, extname, basename } from 'path'

export type Pose =
  | 'idle'
  | 'sleep'
  | 'notifyIcon'

// Shown while the work state is "focus".
export const CAT_POSES: Pose[] = ['idle']
// Shown while the work state is anything other than "focus" (lunch/meeting/off).
export const STATE_POSES: Pose[] = ['sleep']
// The small badge icon shown in the custom notification window.
export const NOTIFY_POSES: Pose[] = ['notifyIcon']
export const POSES: Pose[] = [...CAT_POSES, ...STATE_POSES, ...NOTIFY_POSES]
// Per-work-state images: `state-<work state id>` (ids never change when a state is renamed).
export type StateSpriteKey = `state-${string}`
export type SpriteKey = Pose | StateSpriteKey
const STATE_KEY = /^state-[a-z0-9_-]{1,40}$/
export const isSpriteKey = (value: unknown): value is SpriteKey => typeof value === 'string' && (POSES.includes(value as Pose) || STATE_KEY.test(value))
export const stateSpriteKey = (stateId: string): StateSpriteKey => `state-${stateId}`

const CANDIDATE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif']

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

export interface UserSpriteItem { id:string;name:string;tags:string[];url:string }
export interface SpriteLibraryBackupItem extends Omit<UserSpriteItem,'url'> { image:string }
interface SpriteLibraryMeta extends Omit<UserSpriteItem,'url'> {
  extension:string
  // Kept only so older local stores/backups can be migrated without loss.
  folder?:string
  character?:string
  ip?:string
}
// removedSeeds: bundled stickers the user deleted, so first-run seeding never brings them back.
const libraryStore=new Store<{items:SpriteLibraryMeta[];tags:string[];removedSeeds:string[]}>({name:'sprite-library',defaults:{items:[],tags:[],removedSeeds:[]}})
function userLibraryDir():string { const dir=join(app.getPath('userData'),'sprite-library');if(!existsSync(dir))mkdirSync(dir,{recursive:true});return dir }
const cleanLabel=(value:unknown):string=>typeof value==='string'?value.trim().slice(0,40):''
const cleanTags=(value:unknown):string[]=>Array.isArray(value)?[...new Set(value.map(tag=>cleanLabel(typeof tag==='string'?tag.replace(/^#+/,''):tag)).filter(Boolean))].slice(0,20):[]
const cleanTagRegistry=(value:unknown):string[]=>Array.isArray(value)?[...new Set(value.map(tag=>cleanLabel(typeof tag==='string'?tag.replace(/^#+/,''):tag)).filter(Boolean))].slice(0,100):[]
const migratedTags=(item:Partial<SpriteLibraryMeta>):string[]=>cleanTags(item.tags?.length?item.tags:[item.folder,item.character,item.ip])
export function addUserSprite(sourcePath:string):UserSpriteItem {
  const sourceExt=extname(sourcePath).toLowerCase(),extension=CANDIDATE_EXTENSIONS.includes(sourceExt)?sourceExt:'.png',id=randomUUID()
  const item:SpriteLibraryMeta={id,name:cleanLabel(basename(sourcePath,sourceExt))||'未命名贴图',tags:[],extension}
  copyFileSync(sourcePath,join(userLibraryDir(),`${id}${extension}`));libraryStore.set('items',[...libraryStore.get('items'),item])
  return {...item,url:toDataUrl(join(userLibraryDir(),`${id}${extension}`))}
}
/** Library metadata only — cheap enough for every notification (no image encoding). */
export function listUserSpriteMeta():Omit<UserSpriteItem,'url'>[] {
  const stored=libraryStore.get('items'),normalized=stored.map(item=>({id:item.id,name:cleanLabel(item.name)||'未命名贴图',tags:migratedTags(item),extension:item.extension}))
  if(JSON.stringify(stored)!==JSON.stringify(normalized))libraryStore.set('items',normalized)
  return normalized.flatMap(item=>existsSync(join(userLibraryDir(),`${item.id}${item.extension}`))?[{id:item.id,name:item.name,tags:item.tags}]:[])
}
export function getUserSpriteUrl(id:string):string|undefined {
  const item=libraryStore.get('items').find(value=>value.id===id),file=item&&join(userLibraryDir(),`${item.id}${item.extension}`)
  return file&&existsSync(file)?toDataUrl(file):undefined
}
export function listUserSprites():UserSpriteItem[] {
  return listUserSpriteMeta().flatMap(item=>{const url=getUserSpriteUrl(item.id);return url?[{...item,url}]:[]})
}
export function listUserSpriteTags():string[] {
  const tags=cleanTagRegistry([...(libraryStore.get('tags')??[]),...libraryStore.get('items').flatMap(item=>migratedTags(item))]).sort((a,b)=>a.localeCompare(b,'zh-CN'))
  if(JSON.stringify(tags)!==JSON.stringify(libraryStore.get('tags')??[]))libraryStore.set('tags',tags)
  return tags
}
export function setUserSpriteTags(tags:string[]):string[] { libraryStore.set('tags',cleanTagRegistry(tags));return listUserSpriteTags() }
export function updateUserSprite(id:string,patch:Partial<Pick<UserSpriteItem,'name'|'tags'>>):UserSpriteItem|null {
  let result:UserSpriteItem|null=null
  const items=libraryStore.get('items').map(item=>{if(item.id!==id)return item;const next:SpriteLibraryMeta={id:item.id,extension:item.extension,name:patch.name===undefined?item.name:cleanLabel(patch.name),tags:patch.tags===undefined?migratedTags(item):cleanTags(patch.tags)};const file=join(userLibraryDir(),`${next.id}${next.extension}`);result={id:next.id,name:next.name,tags:next.tags,url:toDataUrl(file)};return next})
  libraryStore.set('items',items);return result
}
/** Remove a sticker from the library. Pet/notification images already applied are copies and stay. */
export function deleteUserSprite(id:string):boolean {
  const items=libraryStore.get('items'),item=items.find(value=>value.id===id);if(!item)return false
  libraryStore.set('items',items.filter(value=>value.id!==id))
  const file=join(userLibraryDir(),`${item.id}${item.extension}`);if(existsSync(file))unlinkSync(file)
  if(readBundledManifest().items.some(seed=>seed.id===id))libraryStore.set('removedSeeds',[...new Set([...(libraryStore.get('removedSeeds')??[]),id])])
  return true
}
/** Use a library sticker for one specific pose (e.g. only the rest image). */
export function applyUserSpriteToPose(id:string,pose:SpriteKey):string|null {
  const item=libraryStore.get('items').find(value=>value.id===id);if(!item||!isSpriteKey(pose))return null
  const file=join(userLibraryDir(),`${item.id}${item.extension}`)
  return existsSync(file)?setCustomSprite(pose,file):null
}
export function applyUserSprite(id:string,target:'cat'|'notify'='cat'):Partial<Record<Pose,string>>|null {
  const item=libraryStore.get('items').find(value=>value.id===id);if(!item)return null
  const file=join(userLibraryDir(),`${item.id}${item.extension}`)
  if(!existsSync(file))return null
  return target==='notify'?{notifyIcon:setCustomSprite('notifyIcon',file)}:setStaticSprite(file)
}
export function getSpriteLibraryBackup():SpriteLibraryBackupItem[] { return listUserSprites().map(({url,...item})=>({...item,image:url})) }
export function getRemovedSeeds():string[] { return libraryStore.get('removedSeeds')??[] }
export function replaceSpriteLibraryBackup(items:SpriteLibraryBackupItem[],tags:string[]=[],removedSeeds?:string[]):void {
  const dir=userLibraryDir();rmSync(dir,{recursive:true,force:true});mkdirSync(dir,{recursive:true})
  const meta:SpriteLibraryMeta[]=[]
  for(const item of items){if(!/^[a-zA-Z0-9_-]{1,80}$/.test(item.id)||meta.some(value=>value.id===item.id))continue;const match=/^data:image\/(png|jpeg|webp|gif);base64,(.*)$/.exec(item.image);if(!match)continue;const extension=match[1]==='jpeg'?'.jpg':`.${match[1]}`;writeFileSync(join(dir,`${item.id}${extension}`),Buffer.from(match[2],'base64'));meta.push({id:item.id,name:cleanLabel(item.name),tags:migratedTags(item as unknown as SpriteLibraryMeta),extension})}
  libraryStore.set('items',meta);libraryStore.set('tags',cleanTagRegistry(tags.length?tags:meta.flatMap(item=>item.tags)))
  // Older backups don't record deleted bundled stickers; keep this machine's list then.
  if(removedSeeds)libraryStore.set('removedSeeds',[...new Set(removedSeeds)])
}

interface BundledSticker { id:string;name:string;tags:string[];file:string }
function bundledStickerDir():string{return app.isPackaged?join(process.resourcesPath,'sticker-library'):join(__dirname,'../../resources/sticker-library')}
/** Optional resources/sticker-library/manifest.json (see the README there). */
function readBundledManifest():{items:BundledSticker[];randomIconTags:string[]}{
  try{
    const raw=JSON.parse(readFileSync(join(bundledStickerDir(),'manifest.json'),'utf8'))
    const items=(Array.isArray(raw?.items)?raw.items:[]).filter((item:any)=>typeof item?.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(item.id)&&typeof item.file==='string'&&!item.file.includes('..'))
    return {items:items.map((item:any)=>({id:item.id,name:cleanLabel(item.name)||item.id,tags:cleanTags(item.tags),file:item.file})),randomIconTags:cleanTags(raw?.randomIconTags)}
  }catch{return {items:[],randomIconTags:[]}}
}
/** Add stickers bundled with this build once. Existing metadata and files are never overwritten. */
export function seedBundledUserSprites():{added:number;randomIconTags:string[]}{
  const manifest=readBundledManifest(),items=libraryStore.get('items'),existing=new Set([...items.map(item=>item.id),...(libraryStore.get('removedSeeds')??[])]),next=[...items];let added=0
  for(const seed of manifest.items){
    const source=join(bundledStickerDir(),seed.file)
    if(existing.has(seed.id)||!existsSync(source))continue
    copyFileSync(source,join(userLibraryDir(),`${seed.id}.png`))
    next.push({id:seed.id,name:seed.name,tags:seed.tags,extension:'.png'});added++
  }
  if(added){libraryStore.set('items',next);setUserSpriteTags([...listUserSpriteTags(),...next.flatMap(item=>item.tags)])}
  return {added,randomIconTags:manifest.randomIconTags}
}

function spritesDir(): string {
  const dir = join(app.getPath('userData'), 'sprites')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function findCustomFile(pose: SpriteKey): string | null {
  const dir = spritesDir()
  for (const ext of CANDIDATE_EXTENSIONS) {
    const candidate = join(dir, `${pose}${ext}`)
    if (existsSync(candidate)) return candidate
  }
  return null
}

function toDataUrl(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  const mime = MIME_BY_EXT[ext] ?? 'image/png'
  const buffer = readFileSync(filePath)
  return `data:${mime};base64,${buffer.toString('base64')}`
}

// Pose images are re-sent to every window on each change; re-encode only when the file changes.
const poseUrlCache = new Map<string, { version: string; url: string }>()
export function getCustomSpriteUrl(pose: SpriteKey): string | null {
  const file = findCustomFile(pose)
  if (!file) { poseUrlCache.delete(pose); return null }
  const { mtimeMs, size } = statSync(file), version = `${file}:${mtimeMs}:${size}`, cached = poseUrlCache.get(pose)
  if (cached?.version === version) return cached.url
  const url = toDataUrl(file)
  poseUrlCache.set(pose, { version, url })
  return url
}

export function getAllCustomSprites(): Partial<Record<SpriteKey, string>> {
  const result: Partial<Record<SpriteKey, string>> = {}
  for (const pose of [...POSES, ...existingStateKeys()]) {
    const url = getCustomSpriteUrl(pose)
    if (url) result[pose] = url
  }
  return result
}

export function setCustomSprite(pose: SpriteKey, sourcePath: string): string {
  const dir = spritesDir()
  for (const ext of CANDIDATE_EXTENSIONS) {
    const existing = join(dir, `${pose}${ext}`)
    if (existsSync(existing)) unlinkSync(existing)
  }
  const ext = CANDIDATE_EXTENSIONS.includes(extname(sourcePath).toLowerCase())
    ? extname(sourcePath).toLowerCase()
    : '.png'
  const target = join(dir, `${pose}${ext}`)
  copyFileSync(sourcePath, target)
  return toDataUrl(target)
}

/** "Set as pet": the focus (idle) image; states without their own image follow it. */
export function setStaticSprite(sourcePath: string): Partial<Record<Pose, string>> {
  const result: Partial<Record<Pose, string>> = {}
  for (const pose of CAT_POSES) {
    result[pose] = setCustomSprite(pose, sourcePath)
  }
  return result
}

const existingStateKeys = (): StateSpriteKey[] => [...new Set(readdirSync(spritesDir()).map(file => file.slice(0, -extname(file).length)).filter(key => STATE_KEY.test(key)))] as StateSpriteKey[]

/**
 * The shared "rest" image is gone: non-focus states without their own image now
 * follow the focus image. Keep what users saw by turning an old rest image into
 * each non-focus state's own image (only where that state has none yet).
 */
export function migrateRestSprite(nonFocusStateIds: string[]): void {
  const rest = findCustomFile('sleep'); if (!rest) return
  for (const id of nonFocusStateIds) { const key = stateSpriteKey(id); if (STATE_KEY.test(key) && !findCustomFile(key)) setCustomSprite(key, rest) }
  resetCustomSprite('sleep')
}

/** "Unify": every state shows `key`'s current image (focus gets it, all per-state images are cleared). */
export function unifyStateSprites(key: SpriteKey): Partial<Record<SpriteKey, string>> {
  const source = key === 'idle' ? null : findCustomFile(key)
  if (source) setCustomSprite('idle', source)
  for (const stateKey of existingStateKeys()) resetCustomSprite(stateKey)
  return getAllCustomSprites()
}

/** Back to the bundled pet: the focus image and every per-state image are removed. */
export function resetStateSprites(): Partial<Record<SpriteKey, string>> {
  for (const key of ['idle', ...existingStateKeys()] as SpriteKey[]) resetCustomSprite(key)
  return getAllCustomSprites()
}

export function resetCustomSprite(pose: SpriteKey): void {
  const dir = spritesDir()
  for (const ext of CANDIDATE_EXTENSIONS) {
    const existing = join(dir, `${pose}${ext}`)
    if (existsSync(existing)) unlinkSync(existing)
  }
}
