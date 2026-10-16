const { test } = require('node:test')
const assert = require('node:assert/strict')
const ts = require('typescript')
const vm = require('node:vm')
const fs = require('node:fs')
const path = require('node:path')
process.env.TZ = 'Asia/Singapore'
function harness(initial = {}) {
  let now = new Date('2026-09-19T10:00:00+08:00').getTime()
  const stores = structuredClone(initial), cache = new Map()
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])) } static now() { return now } }
  class Store {
    constructor({ name, defaults }) { this.name = name; stores[name] = { ...structuredClone(defaults), ...stores[name] } }
    get(key) { return structuredClone(stores[this.name][key]) }
    set(key, value) { stores[this.name][key] = structuredClone(value) }
    get store() { return structuredClone(stores[this.name]) }
    set store(value) { stores[this.name] = structuredClone(value) }
  }
  const root = path.resolve('tests/.runtime')
  const dialog = { showSaveDialog: async () => ({ canceled: false, filePath: path.join(root, 'export.json') }), showOpenDialog: async () => ({ canceled: false, filePaths: [path.join(root, 'export.json')] }), showMessageBox: async () => ({ response: 1 }) }
  function load(file) {
    file = path.resolve(file)
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }; cache.set(file, module)
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
    const customRequire = id => {
      if (id === 'electron-store') return Store
      if (id === 'electron') return { screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } }) }, app: { getPath: () => root, getAppPath: () => root, isPackaged: false }, dialog }
      if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id + '.ts'))
      return require(id)
    }
    vm.runInNewContext('(function(require,module,exports,__dirname){' + code + '\n})', { Date: Clock, Buffer, structuredClone, console })(customRequire, module, module.exports, path.dirname(file))
    return module.exports
  }
  return { load, stores, root, dialog, advance: ms => now += ms, setTime: value => now = new Date(value).getTime() }
}
test('local calendar and diary navigation work around midnight and month boundaries', () => {
  const h = harness(), d = h.load('src/shared/date.ts')
  assert.equal(d.todayStr(new Date('2026-09-19T00:10:00+08:00')), '2026-09-19')
  assert.equal(d.addDays('2026-09-19', 1), '2026-09-20')
  assert.equal(d.addDays('2026-03-01', -1), '2026-02-28')
})
test('pause freezes time and key count; switch while paused does not resume; reset preserves history', () => {
  const h = harness(), w = h.load('src/main/workStateStore.ts')
  assert.equal(w.getWorkSnapshot().startedToday,false);h.advance(60_000)
  assert.equal(w.getWorkSnapshot().companionSeconds,0)
  w.switchState('focus');h.advance(60_000); w.recordSegmentKeystroke()
  w.setRecordingPaused(true); h.advance(120_000); w.recordSegmentKeystroke()
  assert.equal(w.getWorkSnapshot().companionSeconds, 60)
  assert.equal(w.getKeystrokesToday(), 1)
  w.switchState('break'); h.advance(60_000)
  assert.equal(w.getWorkSnapshot().companionSeconds, 60)
  w.setRecordingPaused(false); h.advance(30_000)
  assert.equal(w.getWorkSnapshot().durations.break, 30)
  w.resetTodayRecording(); assert.equal(w.getWorkSnapshot().companionSeconds, 0)
  assert.equal(w.getKeystrokesToday(), 0)
})
test('restart and explicit recording suspension do not count stopped time', () => {
  const h = harness(), w = h.load('src/main/workStateStore.ts')
  w.switchState('focus'); h.advance(60_000); w.checkpointWorkState(); h.advance(3600_000)
  w.reloadWorkState(); assert.equal(w.getWorkSnapshot().companionSeconds, 60)
  w.suspendRecording(); h.advance(7200_000); w.resumeRecording(); h.advance(15_000)
  assert.equal(w.getWorkSnapshot().companionSeconds, 75)
})
test('midnight archives records without changing a completed one-off task', () => {
  const h = harness(), w = h.load('src/main/workStateStore.ts'), t = h.load('src/main/tasksStore.ts')
  h.setTime('2026-09-19T23:59:00+08:00'); w.switchState('focus')
  const item = t.addTask('阅读', false); t.toggleTask(item.id)
  h.advance(60_000); assert.equal(w.getWorkSnapshot().companionSeconds, 0)
  assert.equal(h.stores['work-state'].history['2026-09-19'][0].endedAt - h.stores['work-state'].history['2026-09-19'][0].startedAt, 60_000)
  assert.equal(t.getTasks()[0].completed, true)
})
test('backup round trip restores all stores and sprites; invalid import makes no changes', async () => {
  const h = harness()
  fs.mkdirSync(h.root, { recursive: true })
  try {
    const w = h.load('src/main/workStateStore.ts'), d = h.load('src/main/diaryStore.ts'), t = h.load('src/main/tasksStore.ts'), b = h.load('src/main/backup.ts')
    const settings = h.load('src/main/settingsStore.ts'); settings.setTheme('dark')
    settings.setNotificationPreferences({location:'top-right',hourlyEnabled:true,stateHourlyEnabled:true,keystrokeEnabled:true,keystrokeStep:500,customRules:[{id:'stretch',time:'15:00',message:'起来走一走',schedule:'custom',days:[1,3,5],enabled:true}]})
    const sprite = h.load('src/main/spriteStore.ts')
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')
    fs.writeFileSync(path.join(h.root, 'source.png'), png); sprite.setStaticSprite(path.join(h.root, 'source.png'))
    const libraryItem=sprite.addUserSprite(path.join(h.root,'source.png'));sprite.updateUserSprite(libraryItem.id,{tags:['治愈系','小猫','原创']});sprite.setUserSpriteTags(['治愈系','小猫','原创','未使用标签'])
    assert.match(sprite.getAllCustomSprites().idle, /^data:image\/png;base64,/)
    w.switchState('focus'); h.advance(90_000); w.recordSegmentKeystroke(); w.setRecordingPaused(true)
    d.saveEntry('2026-09-19', { text: '今日记录', images: [sprite.getAllCustomSprites().idle] }); t.addTask('写论文', true)
    await b.exportBackup({})
    const safety=b.saveUpdateSafetyBackup('0.1.0','0.2.0');assert.equal(fs.existsSync(safety),true)
    const exported = JSON.parse(fs.readFileSync(path.join(h.root, 'export.json')))
    b.validateBackup(exported)
    d.deleteEntry('2026-09-19'); sprite.resetCustomSprite('idle');sprite.replaceSpriteLibraryBackup([]); w.resetTodayRecording(); settings.setNotificationPreferences({...settings.getNotificationPreferences(),customRules:[]})
    assert.equal(await b.importBackup({}), true)
    assert.equal(d.getEntry('2026-09-19').text, '今日记录')
    assert.equal(w.getWorkSnapshot().companionSeconds, 90)
    assert.equal(w.getWorkSnapshot().paused, true)
    assert.equal(settings.getTheme(), 'dark')
    assert.equal(settings.getNotificationPreferences().customRules[0].message, '起来走一走')
    assert.equal(sprite.getAllCustomSprites().idle, exported.sprites.idle)
    assert.equal(sprite.listUserSprites()[0].tags[0],'治愈系')
    assert.equal(sprite.listUserSpriteTags().includes('未使用标签'),true)
    assert.equal(fs.readdirSync(path.join(h.root, 'backups')).length, 2)
    const previous = JSON.stringify(h.stores)
    exported.work.segments[0].state = 'Bad!'
    fs.writeFileSync(path.join(h.root, 'export.json'), JSON.stringify(exported))
    await assert.rejects(() => b.importBackup({}))
    assert.equal(JSON.stringify(h.stores), previous)
  } finally { fs.rmSync(h.root, { recursive: true, force: true }) }
})

test('head bubble expands the pet window without moving the pet, closes in place, and follows scale', () => {
  const h = harness(), w = h.load('src/main/windows.ts')
  let bounds = { x: 1100, y: 650, width: 170, height: 170 }
  const win = { getBounds: () => ({ ...bounds }), setBounds: b => { bounds = b }, webContents: { send: () => {} } }
  w.setCatBubble(win, true)
  assert.equal(bounds.height, 476)
  assert.deepEqual(JSON.parse(JSON.stringify(w.getPetBounds(win))), { x: 1100, y: 650, width: 170, height: 170 })
  w.applyCatWindowLayout(win, 1.5)
  assert.equal(w.getPetBounds(win).width, 255)
  assert.equal(w.getPetBounds(win).y + w.getPetBounds(win).height, 820)
  w.setCatBubble(win, false)
  assert.equal(bounds.height, 255)
  bounds = { x: 20, y: 20, width: 170, height: 170 }
  w.setCatBubble(win, true)
  assert.equal(bounds.y, 20)
  assert.equal(w.getPetBounds(win).y, 20)
  assert.equal(w.getPetBounds(win).x, 20)
  assert.equal(w.getCatLayout(win).bubbleBelow, true)
})

test('opening, closing and dragging a bubble never repositions the pet at screen edges', () => {
  for (const pet of [{x:0,y:0,width:170,height:170},{x:1270,y:730,width:170,height:170},{x:0,y:500,width:170,height:170}]) {
    const h=harness(), w=h.load('src/main/windows.ts')
    let bounds={...pet}
    const win={getBounds:()=>({...bounds}),setBounds:b=>{bounds=b},webContents:{send:()=>{}}}
    w.setCatBubble(win,true)
    assert.deepEqual(JSON.parse(JSON.stringify(w.getPetBounds(win))),pet)
    bounds.x += 15; bounds.y += 10
    const dragged={...pet,x:pet.x+15,y:pet.y+10}
    w.setCatBubble(win,false)
    assert.deepEqual(JSON.parse(JSON.stringify(w.getPetBounds(win))),dragged)
    w.setCatBubble(win,true)
    assert.deepEqual(JSON.parse(JSON.stringify(w.getPetBounds(win))),dragged)
  }
})

test('outside-click bounds distinguish the status card from the rest of the screen',()=>{
  const h=harness(),w=h.load('src/main/windows.ts'),bounds={x:400,y:200,width:320,height:306}
  assert.equal(w.pointInsideBounds({x:400,y:200},bounds),true)
  assert.equal(w.pointInsideBounds({x:719,y:505},bounds),true)
  assert.equal(w.pointInsideBounds({x:399,y:300},bounds),false)
  assert.equal(w.pointInsideBounds({x:720,y:300},bounds),false)
})

test('outside drags are distinguished from ordinary clicks',()=>{
  const h=harness(),input=h.load('src/shared/input.ts')
  assert.equal(input.isStationaryClick({x:100,y:100},{x:102,y:103}),true)
  assert.equal(input.isStationaryClick({x:100,y:100},{x:140,y:150}),false)
})

test('separate status surface is positioned at the pet without resizing the pet window', () => {
  const h = harness(), w = h.load('src/main/windows.ts')
  const petBounds = { x: 1100, y: 650, width: 170, height: 170 }
  const pet = { getBounds: () => ({ ...petBounds }) }
  let statusBounds
  let sent
  const status = { setBounds: value => { statusBounds = value }, webContents: { send: (_name, value) => { sent = value } } }
  const layout = w.positionStatusWindow(status, pet)
  assert.deepEqual(pet.getBounds(), petBounds)
  assert.equal(statusBounds.width, 320)
  assert.equal(statusBounds.y + statusBounds.height, petBounds.y)
  assert.equal(layout.bubbleBelow, false)
  assert.equal(layout.placement, 'above')
  assert.deepEqual(sent, layout)
  w.setPetVisualBounds(pet,{x:25,y:18,width:120,height:140,anchorX:52,anchorY:18})
  w.positionStatusWindow(status,pet)
  assert.equal(statusBounds.y+statusBounds.height,petBounds.y+18)
  assert.equal(statusBounds.x+sent.tipLeft,petBounds.x+52)
})

test('speech bubble uses the sprite crown and moves sideways without covering the visible sprite',()=>{
  const h=harness(),w=h.load('src/main/windows.ts')
  const petBounds={x:620,y:360,width:170,height:170},pet={getBounds:()=>({...petBounds})}
  let statusBounds
  const status={setBounds:value=>{statusBounds=value},webContents:{send:()=>{}}}
  w.setPetVisualBounds(pet,{x:30,y:20,width:110,height:130,anchorX:48,anchorY:20})
  const above=w.positionStatusWindow(status,pet)
  assert.equal(above.placement,'above')
  assert.equal(statusBounds.x+above.tipLeft,petBounds.x+48)
  const oversized=h.load('src/main/settingsStore.ts');oversized.setPanelPreference('singleScale',2)
  const side=w.positionStatusWindow(status,pet)
  assert.equal(side.placement,'right')
  assert.ok(statusBounds.x>=petBounds.x+30+110)
  assert.ok(statusBounds.y>=petBounds.y+20)
})

test('reminder lists and deadlines survive calendar changes without recurring tasks', () => {
  const h=harness(), t=h.load('src/main/tasksStore.ts'), dates=h.load('src/shared/tasks.ts')
  const list=t.saveTaskList({name:'研究',color:'#af52de',icon:'▤'})
  const task=t.addTask('提交论文',false,{listId:list.id,dueDate:'2026-09-25'})
  assert.equal(t.getTasks().some(x=>x.id===task.id),false)
  const countdown=t.addTask('回家',false,{listId:list.id,dueDate:'2026-09-29',dueTime:null,countdown:true})
  assert.equal(t.getTasks().some(x=>x.id===countdown.id),true)
  assert.equal(countdown.dueTime,null)
  assert.equal(dates.scheduledOn(task,'2026-09-25'),true)
  t.updateTask(task.id,{dueDate:'2026-09-24'})
  assert.equal(t.getTaskData().items[0].dueDate,'2026-09-24')
  t.updateTask(task.id,{dueTime:'14:35'});assert.equal(t.getTaskData().items[0].dueTime,'14:35')
  assert.throws(()=>t.updateTask(task.id,{dueTime:'25:00'}))
  const oneOff=t.addTask('阅读',true,{listId:list.id,dueDate:'2026-09-18'})
  assert.equal(oneOff.daily,false)
  t.toggleTask(oneOff.id,'2026-09-18')
  assert.equal(dates.completedOn(t.getTaskData().items.find(value=>value.id===oneOff.id),'2026-09-18'),true)
  assert.equal(dates.completedOn(t.getTaskData().items.find(value=>value.id===oneOff.id),'2026-09-19'),true)
  h.advance(86400000)
  assert.equal(dates.completedOn(t.getTaskData().items.find(value=>value.id===oneOff.id),'2026-09-18'),true)
  assert.equal(dates.periodDays('2028-02-14','month').length,29)
  assert.equal(dates.periodDays('2026-09-20','week')[0],'2026-09-14')
  assert.throws(()=>t.addTask('bad',false,{dueDate:'2026-02-30'}))
  t.deleteTaskList(list.id)
  assert.equal(t.getTaskData().lists.some(value=>value.id===list.id),false)
  assert.equal(t.getTaskData().items.every(value=>value.listId==='default'),true)
  assert.throws(()=>t.deleteTaskList('default'))
})

test('single-click reminders are ordered from the nearest deadline to the farthest',()=>{
  const h=harness(),tasks=h.load('src/shared/tasks.ts')
  const item=(id,dueDate,dueTime=null,createdDate='2026-09-01')=>({id,text:id,completed:false,daily:false,countdown:false,lastResetDate:'2026-09-19',listId:'default',dueDate,dueTime,createdDate,completedDates:[],completedDate:null})
  const values=[item('far','2026-10-08'),item('old-overdue','2026-09-10'),item('undated',null),item('today-late','2026-09-19','18:00'),item('tomorrow','2026-09-20'),item('recent-overdue','2026-09-18'),item('today-early','2026-09-19','09:30')]
  values.sort((a,b)=>tasks.compareBubbleTasks(a,b,'2026-09-19'))
  assert.deepEqual(values.map(value=>value.id),['today-early','today-late','recent-overdue','old-overdue','tomorrow','far','undated'])
})
test('legacy task migration keeps last known completion and assigns default list',()=>{
  const h=harness({tasks:{items:[{id:'old',text:'读书',daily:true,completed:true,lastResetDate:'2026-09-18'}]}})
  const task=h.load('src/main/tasksStore.ts').getTaskData().items[0]
  assert.equal(task.listId,'default');assert.equal(task.completed,false);assert.equal(task.daily,false)
  assert.deepEqual(JSON.parse(JSON.stringify(task.completedDates)),['2026-09-18'])
})
test('old settings gain notification defaults without losing saved appearance',()=>{
  const h=harness({settings:{theme:'dark',showPeripherals:true,windowScale:1.2,windowOpacity:.8,panelScale:1,panelOpacity:.9,panelFontScale:1,visualVersion:1}})
  const settings=h.load('src/main/settingsStore.ts')
  assert.equal(settings.getTheme(),'dark');assert.equal(settings.getWindowScale(),1.2)
  assert.equal(settings.getNotificationPreferences().hourlyEnabled,true)
  assert.deepEqual(JSON.parse(JSON.stringify(settings.getNotificationPreferences().randomIconTags)),[])
  assert.equal(settings.getAccentColor(),'#007aff');settings.setAccentColor('#248A3D');assert.equal(settings.getAccentColor(),'#248a3d')
  assert.throws(()=>settings.setAccentColor('green'))
  assert.deepEqual(JSON.parse(JSON.stringify(settings.getNotificationPreferences().customRules)),[])
})
test('notification schedules distinguish workdays, rest days and selected weekdays',()=>{
  const h=harness(),n=h.load('src/shared/notifications.ts')
  const base={id:'n',time:'09:30',message:'喝水',days:[],enabled:true}
  assert.equal(n.noticeRuleMatches({...base,schedule:'weekdays'},new Date('2026-09-21T09:30:00+08:00')),true)
  assert.equal(n.noticeRuleMatches({...base,schedule:'weekdays'},new Date('2026-09-20T09:30:00+08:00')),false)
  assert.equal(n.noticeRuleMatches({...base,schedule:'weekends'},new Date('2026-09-20T09:30:00+08:00')),true)
  assert.equal(n.noticeRuleMatches({...base,schedule:'custom',days:[2,4]},new Date('2026-09-22T09:30:00+08:00')),true)
  assert.equal(n.noticeRuleMatches({...base,schedule:'custom',days:[2,4]},new Date('2026-09-22T09:31:00+08:00')),false)
  assert.equal(n.isKeystrokeMilestone(2000,{keystrokeEnabled:true,keystrokeStep:1000}),true)
  assert.equal(n.isKeystrokeMilestone(2100,{keystrokeEnabled:true,keystrokeStep:1000}),false)
  assert.equal(n.renderNoticeTemplate('{state} {hours} 小时',{state:'写作',hours:2}),'写作 2 小时')
  assert.equal(n.validNoticeRule({...base,schedule:'weekdays',iconSpriteId:'cat-one'}),true)
})
test('custom work states can be added and renamed without losing recorded duration',()=>{
  const h=harness(),settings=h.load('src/main/settingsStore.ts'),work=h.load('src/main/workStateStore.ts')
  const states=settings.getWorkStates();settings.setWorkStates([...states,{id:'writing',label:'写作中',color:'#34c759',icon:'book'}])
  work.getWorkSnapshot();work.switchState('writing');h.advance(45000)
  assert.equal(work.getWorkSnapshot().durations.writing,45)
  settings.setWorkStates(settings.getWorkStates().map(s=>s.id==='writing'?{...s,label:'创作中'}:s))
  assert.equal(settings.getWorkStates().find(s=>s.id==='writing').label,'创作中')
  assert.equal(work.getWorkSnapshot().durations.writing,45)
})
test('hub stays clear of pet after scale changes, and panel preferences are independent',()=>{
  const h=harness(), w=h.load('src/main/windows.ts'), settings=h.load('src/main/settingsStore.ts')
  let bounds={x:1000,y:650,width:170,height:170}, position
  const pet={getBounds:()=>({...bounds}),setBounds:b=>{bounds=b},webContents:{send:()=>{}}}
  const panel={getBounds:()=>({width:400,height:540}),setPosition:(x,y)=>{position={x,y,width:400,height:540}}}
  for(const scale of [0.5,1,1.5,2,1]){
    w.applyCatWindowLayout(pet,scale);w.positionHoverCard(panel,pet)
    const b=w.getPetBounds(pet)
    assert.ok(position.x+position.width<=b.x||position.x>=b.x+b.width||position.y+position.height<=b.y||position.y>=b.y+b.height)
  }
  settings.setWindowOpacity(.3);assert.equal(settings.getPanelPreferences().panelOpacity,1)
  settings.setPanelPreference('panelOpacity',.7);assert.equal(settings.getWindowOpacity(),.3)
  settings.setPanelPreference('singleScale',1.5);w.setCatBubble(pet,true)
  assert.equal(w.getCatLayout(pet).bubbleScale,1.5)
})
test('connected settings sheet resizes one hub window and notification placement follows preference',()=>{
  const h=harness(),w=h.load('src/main/windows.ts')
  const pet={getBounds:()=>({x:1000,y:650,width:170,height:170})}
  let panelBounds={x:0,y:0,width:400,height:540},position,animated=false
  const panel={getBounds:()=>({...panelBounds}),setBounds:(b,a)=>{panelBounds={...panelBounds,...b};animated=a},setSize:(width,height)=>{panelBounds={...panelBounds,width,height}},setPosition:(x,y)=>{panelBounds={...panelBounds,x,y};position={x,y}}}
  assert.equal(w.setHubExtensionLayout(panel,pet,true,true),'right');assert.equal(panelBounds.width,720);assert.equal(animated,true)
  const b=pet.getBounds();assert.ok(panelBounds.x+panelBounds.width<=b.x||panelBounds.x>=b.x+b.width||panelBounds.y+panelBounds.height<=b.y||panelBounds.y>=b.y+b.height)
  w.setHubExtensionLayout(panel,pet,false,true);assert.equal(panelBounds.width,400);assert.equal(animated,true)
  panelBounds={x:1000,y:40,width:400,height:540};assert.equal(w.setHubExtensionLayout(panel,pet,true),'left');assert.equal(panelBounds.x,680)
  w.setHubExtensionLayout(panel,pet,false);assert.equal(panelBounds.x,1000)
  let notifyLayout
  const notice={setBounds:b=>{position={x:b.x,y:b.y,width:b.width,height:b.height}},webContents:{send:(_event,value)=>{notifyLayout=value}}}
  w.positionNotifyWindow(notice,pet,'top-right');assert.deepEqual(position,{x:1084,y:16,width:340,height:110});assert.equal(notifyLayout.placement,'none')
  w.positionNotifyWindow(notice,pet,'pet');assert.equal(position.y,536);assert.equal(notifyLayout.placement,'above');assert.equal(notifyLayout.tipLeft,164)
  const status={getBounds:()=>({x:900,y:400,width:320,height:220})}
  w.positionNotifyWindow(notice,pet,'pet',status);assert.equal(position.y,284);assert.equal(notifyLayout.placement,'above')
  assert.equal(position.x,890)
})

test('sleep time continues after starting, while a new date waits for another state choice',()=>{
  const h=harness(), w=h.load('src/main/workStateStore.ts')
  h.setTime('2026-09-19T23:00:00+08:00');w.switchState('focus');w.checkpointWorkState()
  h.advance(3*3600000)
  assert.equal(w.getWorkSnapshot().companionSeconds,0)
  assert.equal(w.getWorkSnapshot().startedToday,false)
  const history=h.stores['work-state'].history
  const duration=segments=>segments.reduce((n,s)=>n+(s.endedAt-s.startedAt)/1000,0)
  assert.equal(duration(history['2026-09-19']),3600)
  assert.equal(history['2026-09-20'],undefined)
  h.advance(3*3600000);assert.equal(w.getWorkSnapshot().companionSeconds,0)
  w.switchState('focus');h.advance(3600000);assert.equal(w.getWorkSnapshot().companionSeconds,3600)
  w.setRecordingPaused(true);h.advance(3*3600000);assert.equal(w.getWorkSnapshot().companionSeconds,3600)
})

test('reset menu targets are independent and preserve other counters',()=>{
 const h=harness(),w=h.load('src/main/workStateStore.ts')
 w.switchState('focus');h.advance(60000);w.recordSegmentKeystroke();w.switchState('break');h.advance(30000)
 w.resetTodayRecording('focus')
 let s=w.getWorkSnapshot();assert.equal(s.durations.focus,0);assert.equal(s.durations.break,30);assert.equal(s.companionSeconds,90);assert.equal(s.keystrokesToday,1)
 w.resetTodayRecording('companion');s=w.getWorkSnapshot();assert.equal(s.companionSeconds,0);assert.equal(s.durations.break,30)
 w.resetTodayRecording('keystrokes');assert.equal(w.getWorkSnapshot().keystrokesToday,0)
 h.advance(10000);s=w.getWorkSnapshot();assert.equal(s.companionSeconds,10);assert.equal(s.durations.break,40)
 w.correctTodayDuration('companion',125);w.correctTodayDuration('break',75);s=w.getWorkSnapshot();assert.equal(s.companionSeconds,125);assert.equal(s.durations.break,75)
 h.advance(5000);s=w.getWorkSnapshot();assert.equal(s.companionSeconds,130);assert.equal(s.durations.break,80)
 w.resetTodayRecording('all');s=w.getWorkSnapshot();assert.equal(s.companionSeconds,0);assert.equal(s.durations.break,0)
})

test('weekly monthly and yearly check-in statistics include corrected history',()=>{
 const h=harness(),w=h.load('src/main/workStateStore.ts')
 h.setTime('2026-09-18T10:00:00+08:00');w.switchState('focus');h.advance(3600000);w.recordSegmentKeystroke();w.correctTodayDuration('focus',1800);w.setRecordingPaused(true)
 h.setTime('2026-09-19T10:00:00+08:00');w.reloadWorkState();w.switchState('break');h.advance(120000);w.recordSegmentKeystroke()
 const week=w.getWorkStatistics('week','2026-09-19')
 assert.equal(week.startDate,'2026-09-14');assert.equal(week.endDate,'2026-09-20')
 assert.equal(week.companionSeconds,3720);assert.equal(week.durations.focus,1800);assert.equal(week.durations.break,120);assert.equal(week.keystrokes,2);assert.equal(week.activeDays,2)
 assert.equal(w.getWorkStatistics('month','2026-09-19').days.length,30)
 assert.equal(w.getWorkStatistics('year','2026-09-19').days.length,365)
})

test('selected state survives a same-day sleep and process reload',()=>{
 const h=harness(),w=h.load('src/main/workStateStore.ts')
 w.switchState('lunch');h.advance(45*60000);w.checkpointWorkState()
 assert.equal(w.getCurrentState(),'lunch')
 w.reloadWorkState()
 assert.equal(w.getCurrentState(),'lunch')
 assert.equal(w.getWorkSnapshot().state,'lunch')
})

test('cross-day wake still waits for the first manual state choice',()=>{
 const h=harness(),w=h.load('src/main/workStateStore.ts')
 h.setTime('2026-09-19T23:50:00+08:00');w.switchState('lunch');w.checkpointWorkState()
 h.setTime('2026-09-20T08:00:00+08:00');w.reloadWorkState()
 const morning=w.getWorkSnapshot()
 assert.equal(morning.startedToday,false);assert.equal(morning.companionSeconds,0);assert.equal(morning.state,'lunch')
 h.advance(3600000);assert.equal(w.getWorkSnapshot().companionSeconds,0)
 w.switchState('break');h.advance(60000);assert.equal(w.getWorkSnapshot().companionSeconds,60)
})

test('study check-ins support daily plans, date-only plans and independent completion days',()=>{
  const h=harness(),s=h.load('src/main/studyStore.ts')
  const daily=s.saveStudyTask({title:'背 30 个单词',schedule:'daily',startDate:'2026-09-19',targetDate:null,reminderTime:'20:00',enabled:true})
  const dated=s.saveStudyTask({title:'完成模拟卷',schedule:'date',startDate:'2026-09-19',targetDate:'2026-09-20',reminderTime:null,enabled:true})
  assert.deepEqual(s.getStudyTasksForDate('2026-09-19').map(x=>x.title),['背 30 个单词'])
  assert.deepEqual(s.getStudyTasksForDate('2026-09-20').map(x=>x.title),['背 30 个单词','完成模拟卷'])
  s.toggleStudyTask(daily.id,'2026-09-19')
  assert.deepEqual(s.getStudyData().items.find(x=>x.id===daily.id).completedDates,['2026-09-19'])
  assert.equal(s.getStudyData().items.find(x=>x.id===dated.id).completedDates.length,0)
})

test('music listening totals are grouped into week month and year statistics',()=>{
  const h=harness(),m=h.load('src/main/musicStore.ts')
  m.musicStore.store={enabled:false,history:{'2026-09-18':1200,'2026-09-19':1800}}
  const week=m.getMusicStatistics('week','2026-09-19')
  assert.equal(week.totalSeconds,3000)
  assert.equal(week.days.find(day=>day.date==='2026-09-19').seconds,1800)
  assert.equal(m.getMusicSnapshot().todaySeconds,1800)
})
test('diary images live in files, read back as data URLs, migrate and clean up',()=>{
  const fs=require('fs'),path=require('path')
  const url='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
  const h=harness({diary:{font:'default',entries:{'2026-09-01':{text:'旧',images:[url]}}}})
  const dir=path.join(h.root,'diary-images');fs.rmSync(dir,{recursive:true,force:true})
  const d=h.load('src/main/diaryStore.ts')
  d.migrateDiaryImages()
  const stored=h.stores.diary.entries['2026-09-01'].images[0]
  assert.match(stored,/^diary-image:[a-f0-9]{32}\.png$/)
  assert.equal(d.getEntry('2026-09-01').images[0],url)
  d.saveEntry('2026-09-02',{text:'新',images:[url,url]})
  assert.equal(fs.readdirSync(dir).length,1) // identical images share one file
  assert.equal(d.getDiaryBackup().entries['2026-09-02'].images[1],url)
  d.deleteEntry('2026-09-01');assert.equal(fs.readdirSync(dir).length,1)
  d.deleteEntry('2026-09-02');assert.equal(fs.readdirSync(dir).length,0)
})
test('deleting stickers removes the file, and deleted bundled stickers are never re-seeded',()=>{
  const fs=require('fs'),path=require('path')
  const h=harness();fs.rmSync(path.join(h.root,'sprite-library'),{recursive:true,force:true})
  const sprite=h.load('src/main/spriteStore.ts')
  const seeded=sprite.seedBundledUserSprites().added;assert.ok(seeded>0)
  const id=sprite.listUserSprites()[0].id,file=path.join(h.root,'sprite-library',id+'.png')
  assert.equal(fs.existsSync(file),true)
  assert.equal(sprite.deleteUserSprite(id),true)
  assert.equal(fs.existsSync(file),false)
  assert.equal(sprite.listUserSprites().some(item=>item.id===id),false)
  assert.equal(sprite.seedBundledUserSprites().added,0)
  assert.deepEqual(JSON.parse(JSON.stringify(sprite.getRemovedSeeds())),[id])
  assert.equal(sprite.deleteUserSprite('missing'),false)
  // A backup without the field keeps this machine's list; one with it replaces the list.
  sprite.replaceSpriteLibraryBackup([],[]);assert.deepEqual(JSON.parse(JSON.stringify(sprite.getRemovedSeeds())),[id])
  sprite.replaceSpriteLibraryBackup([],[],[]);assert.equal(sprite.seedBundledUserSprites().added,seeded)
})
test('each work state can have its own pet image',()=>{
  const fs=require('fs'),path=require('path')
  const h=harness();fs.rmSync(path.join(h.root,'sprites'),{recursive:true,force:true});fs.mkdirSync(h.root,{recursive:true})
  const sprite=h.load('src/main/spriteStore.ts')
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')
  fs.writeFileSync(path.join(h.root,'state.png'),png)
  assert.equal(sprite.isSpriteKey('state-lunch'),true);assert.equal(sprite.isSpriteKey('state-custom-abc1'),true)
  assert.equal(sprite.isSpriteKey('state-../x'),false);assert.equal(sprite.isSpriteKey('state-'),false);assert.equal(sprite.isSpriteKey('keyboard'),false)
  sprite.setCustomSprite('state-lunch',path.join(h.root,'state.png'))
  assert.match(sprite.getAllCustomSprites()['state-lunch'],/^data:image\/png;base64,/)
  assert.equal(sprite.getAllCustomSprites().idle,undefined)
  sprite.resetCustomSprite('state-lunch')
  assert.equal(sprite.getAllCustomSprites()['state-lunch'],undefined)
})
test('an old shared rest image becomes per-state images, and unify gives every state one image',()=>{
  const fs=require('fs'),path=require('path')
  const h=harness();fs.rmSync(path.join(h.root,'sprites'),{recursive:true,force:true});fs.mkdirSync(h.root,{recursive:true})
  const sprite=h.load('src/main/spriteStore.ts')
  const png=n=>{const f=path.join(h.root,`img-${n}.png`);fs.writeFileSync(f,Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'),Buffer.alloc(n)]));return f}
  sprite.setCustomSprite('idle',png(1));sprite.setCustomSprite('sleep',png(2));sprite.setCustomSprite('state-lunch',png(3))
  sprite.migrateRestSprite(['break','lunch'])
  let all=sprite.getAllCustomSprites()
  assert.equal(all.sleep,undefined)                       // shared rest image is gone
  assert.equal(all['state-break'].length>0,true)           // break inherits the old rest image
  assert.notEqual(all['state-break'],all['state-lunch'])   // lunch keeps its own image
  sprite.migrateRestSprite(['break','lunch'])              // idempotent
  const lunch=all['state-lunch']
  all=sprite.unifyStateSprites('state-lunch')
  assert.equal(all.idle,lunch)
  assert.deepEqual(Object.keys(all).filter(k=>k.startsWith('state-')),[])
})
test('the journal side panel opens 400px wide when the screen has room, narrower otherwise',()=>{
  const h=harness(),w=h.load('src/main/windows.ts')
  const hub=bounds=>({getBounds:()=>({...bounds})})
  assert.equal(w.getHubDetailPlacement(hub({x:300,y:100,width:400,height:540})).bounds.width,400)
  assert.equal(w.getHubDetailPlacement(hub({x:0,y:100,width:1100,height:540})).bounds.width,340)
  assert.equal(w.getHubDetailPlacement(hub({x:0,y:100,width:1300,height:540})).bounds.width,300)
})
