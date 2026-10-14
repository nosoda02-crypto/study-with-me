export function isStationaryClick(start:{x:number;y:number},end:{x:number;y:number},tolerance=6):boolean{
  return Math.hypot(end.x-start.x,end.y-start.y)<tolerance
}
