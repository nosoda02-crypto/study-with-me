import { useEffect, useRef, useState } from 'react'
import type { WorkState, SpriteMap } from '../../preload'

const DEFAULT_IMAGES = Object.fromEntries(['idle', 'sleep'].map(k => [k, `./cat/${k}.svg`]))
type AlphaMap={width:number;height:number;alpha:Uint8ClampedArray;minX:number;minY:number;maxX:number;maxY:number;topX:number}
const alphaMaps=new WeakMap<HTMLImageElement,AlphaMap>()
function readAlpha(img:HTMLImageElement):AlphaMap|null{
  const naturalWidth=img.naturalWidth||1,naturalHeight=img.naturalHeight||1,scale=Math.min(1,256/Math.max(naturalWidth,naturalHeight))
  const width=Math.max(1,Math.round(naturalWidth*scale)),height=Math.max(1,Math.round(naturalHeight*scale)),canvas=document.createElement('canvas')
  canvas.width=width;canvas.height=height
  try{const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return null;context.drawImage(img,0,0,width,height);const pixels=context.getImageData(0,0,width,height).data,alpha=new Uint8ClampedArray(width*height);let minX=width,minY=height,maxX=-1,maxY=-1
    for(let index=0;index<alpha.length;index++){const value=pixels[index*4+3];alpha[index]=value;if(value>12){const x=index%width,y=Math.floor(index/width);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y)}}
    const safeMinY=maxY<0?0:minY
    let topXTotal=0,topXCount=0
    for(let y=safeMinY;y<=Math.min(height-1,safeMinY+1);y++)for(let x=0;x<width;x++)if(alpha[y*width+x]>12){topXTotal+=x+.5;topXCount++}
    const map={width,height,alpha,minX:maxX<0?0:minX,minY:safeMinY,maxX:maxX<0?width-1:maxX,maxY:maxY<0?height-1:maxY,topX:topXCount?topXTotal/topXCount:(width/2)};alphaMaps.set(img,map);return map
  }catch{return null}
}
function imageContentBox(img:HTMLImageElement){const rect=img.getBoundingClientRect(),naturalWidth=img.naturalWidth||rect.width,naturalHeight=img.naturalHeight||rect.height,scale=Math.min(rect.width/naturalWidth,rect.height/naturalHeight),width=naturalWidth*scale,height=naturalHeight*scale;return{left:rect.left+(rect.width-width)/2,top:rect.top+(rect.height-height)/2,width,height}}
function opaqueAt(img:HTMLImageElement,x:number,y:number):boolean{const box=imageContentBox(img);if(x<box.left||x>=box.left+box.width||y<box.top||y>=box.top+box.height)return false;const map=alphaMaps.get(img)??readAlpha(img);if(!map)return true;const px=Math.min(map.width-1,Math.floor((x-box.left)/box.width*map.width)),py=Math.min(map.height-1,Math.floor((y-box.top)/box.height*map.height));return map.alpha[py*map.width+px]>12}

export default function CatView(): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  const [sprites, setSprites] = useState<SpriteMap>({})
  // Unknown during a renderer wake/reload: never flash the focus pose before
  // the persisted selection arrives from the main process.
  const [state, setState] = useState<WorkState | null>(null)
  const clickTimer = useRef<number>()
  const pointer = useRef<{ x: number; y: number; startX: number; startY: number; dragged: boolean; button: number } | null>(null)
  const stageRef=useRef<HTMLDivElement>(null)
  const catRef=useRef<HTMLImageElement>(null)
  const reportCatShape=()=>{const img=catRef.current,stage=stageRef.current;if(!img||!stage||!img.complete)return;const map=alphaMaps.get(img)??readAlpha(img);if(!map)return;const box=imageContentBox(img),root=stage.getBoundingClientRect(),localLeft=box.left-root.left,localTop=box.top-root.top;window.api.setCatVisualBounds({x:localLeft+map.minX/map.width*box.width,y:localTop+map.minY/map.height*box.height,width:(map.maxX-map.minX+1)/map.width*box.width,height:(map.maxY-map.minY+1)/map.height*box.height,anchorX:localLeft+map.topX/map.width*box.width,anchorY:localTop+map.minY/map.height*box.height})}

  useEffect(() => {
    window.api.getSprites().then(setSprites)
    window.api.getWorkState().then(s => setState(s.state))
    const off = [window.api.onSpritesUpdated(setSprites), window.api.onWorkStateUpdated(setState)]
    return () => { off.forEach(f => f()); clearTimeout(clickTimer.current) }
  }, [])
  useEffect(()=>{const frame=requestAnimationFrame(reportCatShape);return()=>cancelAnimationFrame(frame)},[state,sprites])
  // Pet scale changes resize the window: re-measure the visible outline.
  useEffect(()=>{const onResize=()=>requestAnimationFrame(reportCatShape);window.addEventListener('resize',onResize);return()=>window.removeEventListener('resize',onResize)},[])
  // A state's own image wins; otherwise every state follows the focus (idle)
  // image. With no custom images at all, non-focus states show the sleeping cat.
  const petImage = (current: WorkState | null): string => (current && sprites[`state-${current}`]) ||
    sprites.idle || (current === 'focus' ? DEFAULT_IMAGES.idle : DEFAULT_IMAGES.sleep)
  return (
    <div ref={stageRef} className={`scene-stage${dragging ? ' scene-stage--dragging' : ''}`}
    title="左右键单击查看状态 · 左键双击打开手帐 · 拖动移动"
    onContextMenu={e => e.preventDefault()}
    onPointerDown={e => {
      if (e.button !== 0 && e.button !== 2) return
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      pointer.current = { x: e.screenX, y: e.screenY, startX: e.screenX, startY: e.screenY, dragged: false, button: e.button }
    }}
    onPointerMove={e => {
      const p = pointer.current
      if (!p){window.api.setCatPointerThrough(!Array.from(e.currentTarget.querySelectorAll('img')).some(img=>opaqueAt(img,e.clientX,e.clientY)));return}
      if (!p.dragged && Math.hypot(e.screenX - p.startX, e.screenY - p.startY) > 4) {
        p.dragged = true
        setDragging(true)
      }
      if (p.dragged) {
        clearTimeout(clickTimer.current); clickTimer.current = undefined
        window.api.dragCat(e.screenX - p.x, e.screenY - p.y)
        p.x = e.screenX; p.y = e.screenY
      }
    }}
    onPointerCancel={() => { pointer.current = null; setDragging(false) }}
    onLostPointerCapture={() => { pointer.current = null; setDragging(false) }}
    onPointerUp={e => {
      const p = pointer.current; pointer.current = null
      setDragging(false)
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      if (!p || p.dragged || Math.hypot(e.screenX - p.startX, e.screenY - p.startY) > 4) return
      if (p.button === 2) { clearTimeout(clickTimer.current); clickTimer.current = undefined; window.api.reportCatClick(); return }
      if (clickTimer.current !== undefined) {
        clearTimeout(clickTimer.current); clickTimer.current = undefined
        window.api.reportCatDoubleClick()
      } else clickTimer.current = window.setTimeout(() => {
        clickTimer.current = undefined; window.api.reportCatClick()
      }, 320)
    }}>
    <img ref={catRef} className="cat-sprite" src={petImage(state)} decoding="sync" draggable={false} alt="桌宠" onLoad={e=>{readAlpha(e.currentTarget);requestAnimationFrame(reportCatShape)}} />
  </div>
  )
}
