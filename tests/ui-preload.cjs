const { contextBridge, ipcRenderer } = require('electron')
const callbacks = new Map()
const on = (event, callback) => { if (!callbacks.has(event)) callbacks.set(event, new Set()); callbacks.get(event).add(callback); return () => callbacks.get(event).delete(callback) }
const emit = (event, ...args) => callbacks.get(event)?.forEach(f => f(...args))
let state = 'focus', paused = false, startedToday=false
const durations = { focus: 3660, break: 480, lunch: 0, meeting: 900, off: 0 }
const entries = { '2026-09-19': { text: '把注意力放在眼前的小事上。\n\n今天完成了一个小目标，也记得给自己留一点休息的时间。', images: [] } }
let tasks = [{ id: 'a', text: '阅读 20 页，留下一点新想法', completed: false, daily: false }, { id: 'b', text: '完成今天最重要的一件事', completed: false, daily: false }, { id: 'c', text: '喝杯水，伸个懒腰', completed: true, daily: false }]
const today = new Date().toLocaleDateString('en-CA')
// Fixture dates are relative to today so "upcoming" tasks never go stale.
const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }
let lists=[{id:'default',name:'提醒事项',color:'#007aff',icon:'☰'}]
tasks=tasks.map(t=>({...t,lastResetDate:today,createdDate:today,dueDate:today,listId:'default',completedDates:t.completed?[today]:[],completedDate:null,countdown:false}))
tasks.unshift({id:'countdown-home',text:'回家',completed:false,daily:false,countdown:true,lastResetDate:today,createdDate:today,dueDate:inDays(16),dueTime:null,listId:'default',completedDates:[],completedDate:null})
let prefs={scale:1,opacity:1,panelScale:1,panelOpacity:1,panelFontScale:1,singleScale:1,singleOpacity:1,hubOpacity:1,notificationScale:1,notificationOpacity:1,minScale:.5,maxScale:2,minOpacity:.2,maxOpacity:1}
let accentColor='#007aff'
let startupEnabled=false
let noticePrefs={petName:'小猫',location:'pet',displaySeconds:6.5,hourlyEnabled:true,stateHourlyEnabled:true,keystrokeEnabled:true,keystrokeStep:1000,customRules:[],randomIconTags:[],templateIcons:{hourly:'',stateSwitch:'',stateHourly:'',keystroke:'',taskDue:'',taskComplete:'',off:''},templates:{hourly:'现在是 {time}',stateSwitch:'已切换到 {state}',stateHourly:'保持 {state} {hours} 小时',keystroke:'按键 {count} 次',taskDue:'该做 {task}',taskComplete:'完成 {task}',off:'专注 {hours} 小时，按键 {count} 次'}}
let workStates=[{id:'focus',label:'工作中',color:'#007aff',icon:'briefcase'},{id:'break',label:'摸鱼中',color:'#5ac8fa',icon:'waves'},{id:'lunch',label:'午休中',color:'#ff9500',icon:'cup'},{id:'meeting',label:'开会中',color:'#af52de',icon:'people'},{id:'off',label:'下班了',color:'#ff3b30',icon:'moon'}]
let studyItems=[{id:'study-1',title:'背 30 个单词',schedule:'daily',startDate:today,targetDate:null,reminderTime:'20:00',enabled:true,completedDates:[],createdAt:Date.now()}]
let musicSnapshot={enabled:true,playing:true,title:'晴天','artist':'周杰伦',todaySeconds:4830,error:''}
const sprites = {}
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
let userSprites=[{id:'cat-one',name:'趴趴猫',tags:['治愈系','小猫','原创'],url:pixel}]
let userSpriteTags=['治愈系','小猫','原创','全职高手','黄少天','桌宠','消息图标','工作状态','休息状态','可爱角色','像素风格','节日限定','日常表情','加油打气','摸鱼时刻','键盘互动','鼠标互动','生日祝福','早安问候','晚安问候','专注陪伴','假日角色','黄色主题','猫咪伙伴']
let single = 0, double = 0, drags = 0
contextBridge.exposeInMainWorld('api', {
  getCatLayout:async()=>({bubbleOpen:false,petWidth:170,petHeight:170,petLeft:0,petTop:0,bubbleLeft:0}),onCatLayout:f=>on('layout',f),closeCatBubble:()=>emit('layout',{bubbleOpen:false,petWidth:170,petHeight:170,petLeft:0,petTop:0,bubbleLeft:0}),
  onStatusLayout:f=>on('status-layout',f),
  getAppearance:async()=> 'system',setAppearance:async mode=>{await ipcRenderer.invoke('test:theme',mode);emit('appearance',mode)},onAppearanceUpdated:f=>on('appearance',f),
  getAccentColor:async()=>accentColor,setAccentColor:async color=>{accentColor=color;emit('accent',color);return color},onAccentColorUpdated:f=>on('accent',f),
  getWorkState: async () => {const shown=startedToday?durations:Object.fromEntries(Object.keys(durations).map(key=>[key,0]));return { state, paused, startedToday, durations:shown, companionSeconds: Object.values(shown).reduce((a,b)=>a+b,0), focusSeconds:shown.focus, keystrokesToday:startedToday?2486:0, timeline:startedToday?[{state:'focus',startedAt:Date.now()-3660000,endedAt:null,keystrokes:2486}]:[] }},
  getWorkStatistics:async(period,anchorDate)=>{const count=period==='week'?7:period==='month'?30:365;const days=Array.from({length:count},(_,index)=>{const date=new Date(anchorDate+'T12:00:00');date.setDate(date.getDate()-count+index+1);return{date:date.toLocaleDateString('en-CA'),companionSeconds:index%5===0?0:2400+index*180,keystrokes:index%5===0?0:380+index*37,durations:{focus:1800+index*120,break:600,lunch:0,meeting:index%3?0:480,off:0}}});return{period,anchorDate,startDate:days[0].date,endDate:days.at(-1).date,days,companionSeconds:days.reduce((n,d)=>n+d.companionSeconds,0),keystrokes:days.reduce((n,d)=>n+d.keystrokes,0),durations:{focus:days.reduce((n,d)=>n+d.durations.focus,0),break:days.reduce((n,d)=>n+d.durations.break,0),meeting:days.reduce((n,d)=>n+d.durations.meeting,0)},activeDays:days.filter(d=>d.companionSeconds).length}},
  getMusicSnapshot:async()=>musicSnapshot,setMusicTracking:async enabled=>(musicSnapshot={...musicSnapshot,enabled}),getMusicStatistics:async(period,anchorDate)=>{const count=period==='week'?7:period==='month'?30:365;const days=Array.from({length:count},(_,index)=>{const date=new Date(anchorDate+'T12:00:00');date.setDate(date.getDate()-count+index+1);return{date:date.toLocaleDateString('en-CA'),seconds:index%4?1200+index*30:0}});return{startDate:days[0].date,endDate:days.at(-1).date,days,totalSeconds:days.reduce((sum,day)=>sum+day.seconds,0)}},onWindowVisibility:f=>on('visibility',f),onMusicUpdated:f=>on('music',f),
  onWorkStateUpdated: f => on('state',f), switchWorkState: s => { state=s;startedToday=true;emit('state',s) },
  correctTodayDuration:async()=>{}, pauseRecording: async value => { paused=value;emit('state',state) }, resetTodayRecording:async()=>{ for(const k in durations)durations[k]=0;emit('state',state);return true },
  getTaskData:async()=>({items:tasks,lists}),
  deleteTaskList:async id=>{tasks=tasks.map(t=>t.listId===id?{...t,listId:'default'}:t);lists=lists.filter(l=>l.id!==id)},
  saveTaskList:async list=>{const next={...list,id:list.id??String(Date.now())};lists=list.id?lists.map(l=>l.id===list.id?next:l):[...lists,next];return next},
  updateTask:async(id,patch)=>{tasks=tasks.map(t=>t.id===id?{...t,...patch}:t)},
  getTasks:async()=>tasks, addTask:async(text,daily,options={})=>{tasks.push({id:String(Date.now()),text,daily,completed:false,createdDate:today,lastResetDate:today,completedDates:[],completedDate:null,listId:'default',dueDate:today,...options})}, toggleTask:async id=>{const t=tasks.find(t=>t.id===id);t.completed=!t.completed;return t}, deleteTask:async id=>{tasks=tasks.filter(t=>t.id!==id)},
  getStudyData:async()=>({items:studyItems}),saveStudyTask:async(input,id)=>{const old=studyItems.find(item=>item.id===id);const next={...input,id:id??String(Date.now()),completedDates:old?.completedDates??[],createdAt:old?.createdAt??Date.now()};studyItems=id?studyItems.map(item=>item.id===id?next:item):[...studyItems,next];return next},toggleStudyTask:async(id,date)=>{let result;studyItems=studyItems.map(item=>{if(item.id!==id)return item;const done=item.completedDates.includes(date);result={...item,completedDates:done?item.completedDates.filter(value=>value!==date):[...item.completedDates,date]};return result});return result},deleteStudyTask:async id=>{studyItems=studyItems.filter(item=>item.id!==id)},
  getTodayKey:async()=> '2026-09-19', getDiaryFont:async()=> 'sans', setDiaryFont:async()=>{},
  getDiaryEntry:async d=>entries[d]??{text:'',images:[]},saveDiaryEntry:async(d,e)=>{entries[d]=e}, pickDiaryImage:async()=>null,
  getSprites:async()=>sprites,onSpritesUpdated:f=>on('sprites',f),getUserSprites:async()=>userSprites,getUserSpriteTags:async()=>[...new Set([...userSpriteTags,...userSprites.flatMap(item=>item.tags)])].sort(),setUserSpriteTags:async tags=>(userSpriteTags=[...new Set(tags)]),resetStateSprites:async()=>{for(const k of Object.keys(sprites))if(k==='idle'||k.startsWith('state-'))delete sprites[k];return {...sprites}},unifyStateSprites:async key=>{if(key!=='idle'&&sprites[key])sprites.idle=sprites[key];for(const k of Object.keys(sprites))if(k.startsWith('state-'))delete sprites[k];return {...sprites}},applyUserSpriteToPose:async(id,pose)=>{const item=userSprites.find(i=>i.id===id);if(!item)return null;sprites[pose]=item.url;return item.url},deleteUserSprite:async id=>{userSprites=userSprites.filter(item=>item.id!==id);return true},updateUserSprite:async(id,patch)=>{userSprites=userSprites.map(item=>item.id===id?{...item,...patch}:item);return userSprites.find(item=>item.id===id)},applyUserSprite:async(id,target)=>target==='notify'?{notifyIcon:pixel}:{idle:pixel,sleep:pixel},
  getWindowSettings:async()=>prefs,onWindowSettingsUpdated:f=>on('window-settings',f),getStartupEnabled:async()=>startupEnabled,setStartupEnabled:async enabled=>(startupEnabled=enabled),
  setWindowScale:v=>{prefs.scale=v;emit('window-settings',prefs)},setWindowOpacity:v=>{prefs.opacity=v;emit('window-settings',prefs)},setPanelPreference:(key,v)=>{prefs[key]=v;emit('window-settings',prefs)},
  getNotificationPreferences:async()=>noticePrefs,setNotificationPreferences:async next=>(noticePrefs=next),
  getWorkStates:async()=>workStates,setWorkStates:async next=>(workStates=next),
  onDataImported:f=>on('imported',f),onNotifyShow:f=>on('notify',f),onNotifyLayout:f=>on('notify-layout',f),
  closeCurrentWindow:()=>{},closeNotify:()=>{},setCatVisualBounds:()=>{},setCatPointerThrough:()=>{},reportCatDoubleClick:()=>{double++},reportCatClick:()=>{single++},dragCat:()=>{drags++},
  openSpriteSettingsWindow:()=>{},openWindowSettingsWindow:()=>{},openHubDetail:async detail=>emit('opened-detail',detail),closeHubDetail:()=>emit('closed-detail'),beginHubDetailClose:()=>emit('hub-detail-state',null),resizeHubSplit:()=>{},requestHubDetailClose:()=>emit('hub-detail-request-close'),onHubDetailReveal:f=>{const off=on('hub-detail-reveal',f);setTimeout(()=>emit('hub-detail-reveal'),50);return off},onHubDetailCloseRequested:f=>on('hub-detail-request-close',f),onHubDetailState:f=>on('hub-detail-state',f),onHubDetailChanged:f=>on('hub-detail-set',f),onHubOpenDetail:f=>on('hub-detail',f),exportBackup:async()=> 'test-backup.json',importBackup:async()=>true
})
// README screenshots (window opened with --readme-demo): the bundled stickers with
// their real names/tags, and the pet/message settings the author actually uses.
if (process.argv.includes('--readme-demo')) {
  const path = require('path'), fs = require('fs'), { pathToFileURL } = require('url')
  const dir = path.join(__dirname, '../resources/sticker-library')
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
  const url = file => pathToFileURL(path.join(dir, file)).href
  userSprites = manifest.items.map(item => ({ id: item.id, name: item.name, tags: item.tags, url: url(item.file) }))
  userSpriteTags = [...new Set(userSprites.flatMap(item => item.tags))]
  const pet = url('gallery/character-04.png')
  Object.assign(sprites, { idle: pet, sleep: pet, notifyIcon: url('huang-shaotian/huang-shaotian-01.png') })
  noticePrefs = { ...noticePrefs, petName: '少天', displaySeconds: 10, randomIconTags: manifest.randomIconTags }
}
contextBridge.exposeInMainWorld('testApi',{counts:()=>({single,double,drags}),entries:()=>entries,noticePrefs:()=>noticePrefs,workStates:()=>workStates,emit:(event,...args)=>emit(event,...args)})
setTimeout(()=>emit('notify',{title:'今日的小目标，完成了',message:'又向前走了一步。休息一下，继续一起努力。'}),500)
