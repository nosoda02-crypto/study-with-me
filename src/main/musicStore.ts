import Store from './cachedStore'
import { execFile } from 'child_process'
import { periodRange,type CheckinPeriod } from '../shared/statistics'
import { addDays,todayStr } from '../shared/date'
import type { MusicSnapshot,MusicStatistics } from '../shared/music'

export interface MusicSchema{enabled:boolean;history:Record<string,number>}
export const musicStore=new Store<MusicSchema>({name:'music-listening',defaults:{enabled:false,history:{}}})
let playing=false,title='',artist='',error='',lastSampleAt=Date.now(),pendingDate=todayStr(),pendingSeconds=0,sampling=false

function run(file:string,args:string[]):Promise<string>{return new Promise((resolve,reject)=>execFile(file,args,{timeout:3500},(err,stdout)=>err?reject(err):resolve(stdout.trim())))}
function totalFor(date:string):number{return Math.round((musicStore.get('history')[date]??0)+(pendingDate===date?pendingSeconds:0))}
export function getMusicSnapshot():MusicSnapshot{return{enabled:musicStore.get('enabled'),playing,title,artist,todaySeconds:totalFor(todayStr()),error}}
export function setMusicTracking(enabled:boolean):MusicSnapshot{
  if(!enabled)flushMusic()
  musicStore.set('enabled',enabled);lastSampleAt=Date.now();playing=false;error=''
  return getMusicSnapshot()
}
export function flushMusic():void{
  if(pendingSeconds<=0)return
  const history=musicStore.get('history');history[pendingDate]=(history[pendingDate]??0)+pendingSeconds
  musicStore.set('history',history);pendingSeconds=0
}
export async function sampleMusic():Promise<MusicSnapshot>{
  if(sampling||!musicStore.get('enabled'))return getMusicSnapshot()
  sampling=true
  const now=Date.now(),date=todayStr()
  if(date!==pendingDate){flushMusic();pendingDate=date}
  if(playing)pendingSeconds+=Math.min(10,Math.max(0,(now-lastSampleAt)/1000))
  lastSampleAt=now
  try{
    await run('/usr/bin/pgrep',['-x','Music'])
    const output=await run('/usr/bin/osascript',['-e','tell application "Music"','-e','if player state is playing then','-e','return "playing" & tab & name of current track & tab & artist of current track','-e','else','-e','return "stopped"','-e','end if','-e','end tell'])
    const [state,nextTitle='',nextArtist='']=output.split('\t')
    playing=state==='playing';title=playing?nextTitle:'';artist=playing?nextArtist:'';error=''
  }catch(cause){
    playing=false;title='';artist=''
    const message=cause instanceof Error?cause.message:String(cause)
    error=/not allowed|assistive|authorized|-1743/i.test(message)?'请在系统设置的“隐私与安全性 → 自动化”中允许访问 Music。':''
  }finally{sampling=false}
  return getMusicSnapshot()
}
export function getMusicStatistics(period:CheckinPeriod,anchorDate:string):MusicStatistics{
  const {startDate,endDate}=periodRange(period,anchorDate),days=[] as {date:string;seconds:number}[]
  for(let date=startDate;date<=endDate;date=addDays(date,1))days.push({date,seconds:totalFor(date)})
  return{startDate,endDate,days,totalSeconds:days.reduce((sum,day)=>sum+day.seconds,0)}
}
export default musicStore
