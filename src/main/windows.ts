import { getPanelPreferences } from './settingsStore'
import { bubbleBaseHeight } from '../shared/appearance'
import type { NoticeLocation } from '../shared/notifications'
import { BrowserWindow, screen } from 'electron'
import { join } from 'path'

const allWorkspaceOptions = { visibleOnFullScreen: true, skipTransformProcessType: true }

/** Keep every companion surface available on every macOS Space. */
export function keepWindowOnAllWorkspaces(win: BrowserWindow): void {
  if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, allWorkspaceOptions)
}

/** Rebind a hidden window before showing it so it appears on the active Space. */
export function showWindowOnCurrentWorkspace(win: BrowserWindow, inactive = false): void {
  if (process.platform === 'darwin' && !win.isVisible()) {
    // Hidden NSWindows may retain the Space where they were last ordered out.
    // Reapplying the collection behaviour while hidden makes the next order-in
    // happen on the user's current Space without moving the window on screen.
    win.setVisibleOnAllWorkspaces(false, allWorkspaceOptions)
    win.setVisibleOnAllWorkspaces(true, allWorkspaceOptions)
  } else keepWindowOnAllWorkspaces(win)
  if (inactive) win.showInactive()
  else win.show()
  win.moveTop()
}

const PET_SIZE = { width: 170, height: 170 }

function scaledSize(scale: number): { width: number; height: number } {
  return { width: Math.round(PET_SIZE.width * scale), height: Math.round(PET_SIZE.height * scale) }
}

export interface CatLayout {
  bubbleOpen: boolean
  petWidth: number
  petHeight: number
  petLeft: number
  petTop: number
  bubbleLeft: number
  bubbleTop: number
  bubbleBelow: boolean
  tipLeft: number
  bubbleScale: number
}
const catLayouts = new WeakMap<BrowserWindow, CatLayout>()
type PetVisualBounds={x:number;y:number;width:number;height:number;anchorX:number;anchorY:number}
const catVisualBounds=new WeakMap<BrowserWindow,PetVisualBounds>()
export function pointInsideBounds(point:{x:number;y:number},bounds:Electron.Rectangle):boolean{
  return point.x>=bounds.x&&point.x<bounds.x+bounds.width&&point.y>=bounds.y&&point.y<bounds.y+bounds.height
}
export function getCatLayout(win: BrowserWindow): CatLayout {
  return catLayouts.get(win) ?? { bubbleOpen: false, petWidth: win.getBounds().width, petHeight: win.getBounds().height, petLeft: 0, petTop: 0, bubbleLeft: 0, bubbleTop: 0, bubbleBelow: false, tipLeft: 160, bubbleScale: 1 }
}
export function getPetBounds(win: BrowserWindow): Electron.Rectangle {
  const bounds = win.getBounds()
  const layout = getCatLayout(win)
  return { x: bounds.x + layout.petLeft, y: bounds.y + layout.petTop, width: layout.petWidth, height: layout.petHeight }
}
export function setPetVisualBounds(win:BrowserWindow,bounds:{x:number;y:number;width:number;height:number;anchorX?:number;anchorY?:number}):void{
  const pet=getPetBounds(win)
  const x=Math.max(0,Math.min(bounds.x,pet.width)),y=Math.max(0,Math.min(bounds.y,pet.height))
  const width=Math.max(1,Math.min(bounds.width,pet.width-x)),height=Math.max(1,Math.min(bounds.height,pet.height-y))
  const anchorX=Math.max(x,Math.min(Number.isFinite(bounds.anchorX)?bounds.anchorX!:x+width/2,x+width))
  const anchorY=Math.max(y,Math.min(Number.isFinite(bounds.anchorY)?bounds.anchorY!:y,y+height))
  catVisualBounds.set(win,{x,y,width,height,anchorX,anchorY})
}
export function getPetVisibleBounds(win:BrowserWindow):Electron.Rectangle{
  const pet=getPetBounds(win),visible=catVisualBounds.get(win)
  return visible?{x:pet.x+visible.x,y:pet.y+visible.y,width:visible.width,height:visible.height}:pet
}
export function getPetSpeechAnchor(win:BrowserWindow):{x:number;y:number}{
  const pet=getPetBounds(win),visible=catVisualBounds.get(win)
  return visible?{x:pet.x+visible.anchorX,y:pet.y+visible.anchorY}:{x:pet.x+pet.width/2,y:pet.y}
}
/** The bubble is part of the pet's transparent window, not a separate popup. */
export function setCatBubble(win: BrowserWindow, bubbleOpen: boolean, pet = getPetBounds(win)): void {
  const area = screen.getDisplayMatching(pet).workArea
  const { singleScale, panelFontScale } = getPanelPreferences()
  const bubbleWidth = Math.ceil(320 * singleScale)
  const bubbleHeight = Math.ceil(bubbleBaseHeight(panelFontScale) * singleScale)
  const bubbleBelow = bubbleOpen && pet.y - bubbleHeight < area.y
  const bubbleX = Math.max(area.x, Math.min(pet.x + (pet.width - bubbleWidth) / 2, area.x + area.width - bubbleWidth))
  const bubbleY = bubbleBelow ? pet.y + pet.height : pet.y - bubbleHeight
  // Union of the fixed pet rectangle and the independently positioned bubble.
  // Clamping the union would move the pet whenever the bubble meets a screen edge.
  const x = bubbleOpen ? Math.min(pet.x, bubbleX) : pet.x
  const y = bubbleOpen ? Math.min(pet.y, bubbleY) : pet.y
  const width = bubbleOpen ? Math.max(pet.x + pet.width, bubbleX + bubbleWidth) - x : pet.width
  const height = bubbleOpen ? Math.max(pet.y + pet.height, bubbleY + bubbleHeight) - y : pet.height
  const layout: CatLayout = {
    bubbleOpen, petWidth: pet.width, petHeight: pet.height,
    petLeft: pet.x - x, petTop: pet.y - y,
    bubbleLeft: bubbleX - x, bubbleTop: bubbleY - y, bubbleBelow,
    bubbleScale: singleScale,
    tipLeft: Math.max(24, Math.min(296, (pet.x + pet.width / 2 - bubbleX) / singleScale))
  }
  catLayouts.set(win, layout)
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.ceil(width), height: Math.ceil(height) }, false)
  // Native window managers can adjust requested bounds; derive offsets from the
  // actual result so the pet remains at its original desktop coordinates.
  const actual = win.getBounds()
  layout.petLeft = pet.x - actual.x
  layout.petTop = pet.y - actual.y
  layout.bubbleLeft = bubbleX - actual.x
  layout.bubbleTop = bubbleY - actual.y
  win.webContents.send('cat:layout', layout)
}

export function createCatWindow(scale: number): BrowserWindow {
  const size = scaledSize(scale)

  const catWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor:'#00000000',
    opacity: 1,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      backgroundThrottling:false
    }
  })

  catWindow.setAlwaysOnTop(true, 'screen-saver')
  keepWindowOnAllWorkspaces(catWindow)

  const { x, y, width, height } = screen.getPrimaryDisplay().workArea
  catWindow.setPosition(Math.round(x + width - size.width - 24), Math.round(y + height - size.height - 24))

  loadRendererRoute(catWindow, '')

  catWindow.once('ready-to-show', () => showWindowOnCurrentWorkspace(catWindow))

  return catWindow
}

export interface StatusWindowLayout {
  bubbleBelow: boolean
  placement:'above'|'below'|'left'|'right'
  tipLeft: number
  tipTop:number
  bubbleScale: number
}

/** Keep the bubble off the pet's transparent native surface to avoid a resize flash. */
export function createStatusWindow(parent: BrowserWindow): BrowserWindow {
  const { singleScale, panelFontScale } = getPanelPreferences()
  const win = new BrowserWindow({
    width: Math.ceil(320 * singleScale),
    height: Math.ceil(bubbleBaseHeight(panelFontScale) * singleScale),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      backgroundThrottling: false
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  keepWindowOnAllWorkspaces(win)
  positionStatusWindow(win, parent)
  loadRendererRoute(win, '#/hover-card')
  return win
}

export function positionStatusWindow(win: BrowserWindow, parent: BrowserWindow): StatusWindowLayout {
  const pet = getPetVisibleBounds(parent)
  const anchor=getPetSpeechAnchor(parent)
  const area = screen.getDisplayMatching(pet).workArea
  const { singleScale, panelFontScale } = getPanelPreferences()
  const width = Math.ceil(320 * singleScale)
  const height = Math.ceil(bubbleBaseHeight(panelFontScale) * singleScale)
  const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(value,max))
  const aboveFits=anchor.y-height>=area.y
  const belowFits=pet.y+pet.height+height<=area.y+area.height
  let placement:StatusWindowLayout['placement']=aboveFits?'above':belowFits?'below':(area.x+area.width-(pet.x+pet.width)>=pet.x-area.x?'right':'left')
  let x:number,y:number
  if(placement==='above'){
    x=clamp(anchor.x-width/2,area.x,area.x+area.width-width)
    y=anchor.y-height
  }else if(placement==='below'){
    x=clamp(pet.x+(pet.width-width)/2,area.x,area.x+area.width-width)
    y=pet.y+pet.height
  }else{
    const gap=8
    x=placement==='right'?pet.x+pet.width+gap:pet.x-width-gap
    x=clamp(x,area.x,area.x+area.width-width)
    // Begin at the detected crown, move clear of the sprite, then settle slightly lower.
    y=clamp(anchor.y+12,area.y,area.y+area.height-height)
  }
  const bubbleBelow=placement==='below'
  const targetX=placement==='below'?pet.x+pet.width/2:anchor.x
  const layout = {
    bubbleBelow,
    placement,
    bubbleScale: singleScale,
    tipLeft: clamp((targetX-x)/singleScale,24,296),
    tipTop:clamp((anchor.y-y+18)/singleScale,24,bubbleBaseHeight(panelFontScale)-24)
  }
  win.setBounds({ x: Math.round(x), y: Math.round(y), width, height }, false)
  win.webContents.send('status:layout', layout)
  return layout
}

/** Resize the cat window when scale changes, keeping its bottom-right corner anchored. */
export function applyCatWindowLayout(catWindow: BrowserWindow, scale: number): void {
  const size = scaledSize(scale)
  const current = getPetBounds(catWindow)
  const pet = { x: current.x + current.width - size.width, y: current.y + current.height - size.height, ...size }
  setCatBubble(catWindow, getCatLayout(catWindow).bubbleOpen, pet)
}

function loadRendererRoute(win: BrowserWindow, hash: string): void {
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}${hash}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
}

/** Center above the pet; fall below if needed, then clamp to the display. */
export function positionHoverCard(panel: BrowserWindow, catWindow: BrowserWindow): void {
  const cat = getPetVisibleBounds(catWindow)
  const { workArea: a } = screen.getDisplayMatching(cat)
  const { width, height } = panel.getBounds()
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))
  let x = clamp(cat.x + (cat.width - width) / 2, a.x, a.x + a.width - width)
  let y = cat.y - height - 12
  if (y < a.y) {
    if (cat.y + cat.height + 12 + height <= a.y + a.height) y = cat.y + cat.height + 12
    else {
      y = clamp(cat.y + (cat.height - height) / 2, a.y, a.y + a.height - height)
      x = cat.x - width - 12 >= a.x ? cat.x - width - 12 : cat.x + cat.width + 12
    }
  }
  // On very small displays prioritize keeping the pet uncovered over centering.
  panel.setPosition(Math.round(x), Math.round(y))
}

/**
 * The consolidated "陪伴面板": stats / tasks / diary in one frameless floating
 * widget with a sidebar nav, glassmorphism card look via native macOS vibrancy
 * (the OS blurs whatever's behind the window - no CSS backdrop-filter needed
 * on top, that would just blur the window's own text).
 */
export function createHubWindow(parent: BrowserWindow): BrowserWindow {
  const win = new BrowserWindow({
    width:400,
    height:540,
    minWidth: 340,
    minHeight: 420,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    resizable: true,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    show:false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.setAlwaysOnTop(true, 'floating')
  keepWindowOnAllWorkspaces(win)

  positionHoverCard(win, parent)
  loadRendererRoute(win, '#/hub')
  win.webContents.once('did-finish-load', () => {
    void win.webContents.executeJavaScript(`(async()=>{if(document.fonts?.ready)await document.fonts.ready;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame)})()`).then(() => {
      if (!win.isDestroyed()) showWindowOnCurrentWorkspace(win)
    })
  })

  return win
}

export type HubDetailKind='sprites'|'window'|'notifications'|'states'

export function getHubDetailPlacement(hub:BrowserWindow):{direction:HubExtensionDirection;bounds:Electron.Rectangle}{
  const current=hub.getBounds()
  const area=screen.getDisplayMatching(current).workArea
  // Default side panel width; narrower (down to 300) only when the screen has no room.
  const sideWidth=Math.max(300,Math.min(400,area.width-current.width))
  const leftSpace=current.x-area.x
  const rightSpace=area.x+area.width-(current.x+current.width)
  const direction:HubExtensionDirection=rightSpace>=sideWidth||rightSpace>=leftSpace?'right':'left'
  const width=sideWidth
  const rawX=direction==='right'?current.x+current.width:current.x-sideWidth
  const x=Math.max(area.x,Math.min(rawX,area.x+area.width-width))
  return {direction,bounds:{x:Math.round(x),y:current.y,width,height:current.height}}
}

export function positionHubDetailWindow(win:BrowserWindow,hub:BrowserWindow,direction:HubExtensionDirection):void{
  const current=hub.getBounds()
  const area=screen.getDisplayMatching(current).workArea
  const sideWidth=Math.max(260,Math.min(win.getBounds().width,area.width-current.width))
  const width=sideWidth
  const rawX=direction==='right'?current.x+current.width:current.x-sideWidth
  const next={x:Math.max(area.x,Math.min(rawX,area.x+area.width-width)),y:current.y,width,height:current.height}
  const before=win.getBounds()
  if(before.x!==next.x||before.y!==next.y||before.width!==next.width||before.height!==next.height)win.setBounds(next,false)
}

/** A separate transparent surface prevents macOS from scaling or moving the hub. */
export function createHubDetailWindow(hub:BrowserWindow,detail:HubDetailKind,direction:HubExtensionDirection,bounds:Electron.Rectangle):BrowserWindow{
  const win=new BrowserWindow({
    ...bounds,
    frame:false,
    transparent:true,
    backgroundColor:'#00000000',
    hasShadow:false,
    resizable:true,
    minWidth:260,
    minHeight:420,
    movable:false,
    minimizable:false,
    maximizable:false,
    skipTaskbar:true,
    alwaysOnTop:true,
    show:false,
    webPreferences:{preload:join(__dirname,'../preload/index.js'),sandbox:false}
  })
  win.setAlwaysOnTop(true,'floating')
  keepWindowOnAllWorkspaces(win)
  loadRendererRoute(win,`#/hub-detail?detail=${encodeURIComponent(detail)}&direction=${direction}`)
  win.webContents.once('did-finish-load',()=>{
    if(win.isDestroyed())return
    showWindowOnCurrentWorkspace(win,true)
    // Reveal only after the transparent surface has reached the compositor.
    // Starting during page load makes the first visible frame already open.
    setTimeout(()=>{
      if(win.isDestroyed())return
      hub.webContents.send('hub-detail:state',direction)
      win.webContents.send('hub-detail:reveal')
    },50)
  })
  return win
}

/** Grow the existing hand-book window into a connected two-pane sheet. */
export type HubExtensionDirection='left'|'right'

const NOTIFY_SIZE = { width: 340, height: 110 }
function notifySize():{width:number;height:number}{const scale=getPanelPreferences().notificationScale;return{width:Math.round(NOTIFY_SIZE.width*scale),height:Math.round(NOTIFY_SIZE.height*scale)}}

/**
 * A custom notification card (not the OS Notification Center) that slides in
 * near the bottom-right corner - triggered on clocking out or finishing a
 * task. `focusable: false` is what actually keeps it non-activating on macOS
 * (the same trick the hover card uses); `type: 'panel'` looked like the more
 * "correct" Electron option for this but throws "NSWindow does not support
 * nonactivating panel styleMask" when combined with transparent + frameless
 * here, so it's deliberately left out.
 */
export function positionNotifyWindow(
  win: BrowserWindow,
  parent: BrowserWindow,
  location: NoticeLocation = 'pet',
  statusWindow?: BrowserWindow | null
): void {
  const pet = getPetVisibleBounds(parent)
  const crown=getPetSpeechAnchor(parent)
  const { workArea } = screen.getDisplayMatching(pet)
  const size=notifySize()
  const scale=getPanelPreferences().notificationScale
  const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(value,max))
  if(location==='top-right'){
    win.setBounds({x:workArea.x+workArea.width-size.width-16,y:workArea.y+16,...size},false)
    win.webContents.send('notify:layout',{placement:'none',tipLeft:NOTIFY_SIZE.width/2,tipTop:NOTIFY_SIZE.height/2})
    return
  }

  const gap=statusWindow?6:4
  const reference=statusWindow?.getBounds()??pet
  const targetX=statusWindow?reference.x+reference.width/2:crown.x
  const targetY=statusWindow?reference.y:crown.y
  const aboveY=targetY-size.height-gap
  const belowY=(statusWindow?reference.y+reference.height:pet.y+pet.height)+gap
  let placement:'above'|'below'|'left'|'right'=aboveY>=workArea.y?'above':belowY+size.height<=workArea.y+workArea.height?'below':(workArea.x+workArea.width-(reference.x+reference.width)>=reference.x-workArea.x?'right':'left')
  let x:number,y:number
  if(placement==='above'||placement==='below'){
    x=clamp(targetX-size.width/2,workArea.x,workArea.x+workArea.width-size.width)
    y=placement==='above'?aboveY:belowY
  }else{
    const leftSpace=reference.x-workArea.x
    const rightSpace=workArea.x+workArea.width-(reference.x+reference.width)
    placement=rightSpace>=leftSpace?'right':'left'
    x=rightSpace>=leftSpace
      ? clamp(reference.x+reference.width+gap,workArea.x,workArea.x+workArea.width-size.width)
      : clamp(reference.x-size.width-gap,workArea.x,workArea.x+workArea.width-size.width)
    const sideTargetY=statusWindow?reference.y+reference.height/2:crown.y+12
    y=clamp(sideTargetY-size.height/2,workArea.y,workArea.y+workArea.height-size.height)
  }
  win.setBounds({x:Math.round(x),y:Math.round(y),...size},false)
  const verticalTarget=placement==='below'?(statusWindow?reference.y+reference.height:pet.y+pet.height):targetY
  const horizontalTarget=statusWindow?reference.y+reference.height/2:crown.y+12
  win.webContents.send('notify:layout',{
    placement,
    tipLeft:clamp((targetX-x)/scale-6,24,NOTIFY_SIZE.width-24),
    tipTop:clamp(((placement==='left'||placement==='right'?horizontalTarget:verticalTarget)-y)/scale-5,20,NOTIFY_SIZE.height-20)
  })
}

export function createNotifyWindow(parent: BrowserWindow): BrowserWindow {
  const size=notifySize()
  const win = new BrowserWindow({
    width:size.width,
    height:size.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    // The CSS bubble is the only visible material. A window-level vibrancy layer
    // paints the whole rectangular BrowserWindow and looks like a second frame.
    hasShadow: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  // Keep the notification on the Space the user is currently viewing. Without
  // this, macOS associates the hidden window with the Space where it was first
  // created and can switch back there the next time showInactive() is called.
  keepWindowOnAllWorkspaces(win)
  positionNotifyWindow(win, parent)
  loadRendererRoute(win, '#/notify')

  return win
}

