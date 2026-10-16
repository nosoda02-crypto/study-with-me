const { app, BrowserWindow, screen } = require('electron')
const ts = require('typescript'), fs = require('fs'), path = require('path'), Module = require('module'), assert = require('assert/strict')
app.setPath('userData', path.join(__dirname, '.electron-layout'))
app.setPath('sessionData', path.join(__dirname, '.electron-layout'))
require.extensions['.ts'] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file)
const filename = path.resolve('src/main/windows.ts')
const mod = new Module(filename, module)
mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename))
mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, filename)
const w = mod.exports
app.whenReady().then(async () => {
 const a = screen.getPrimaryDisplay().workArea
 const win = new BrowserWindow({width:170,height:170,show:false,frame:false,transparent:true,resizable:false,movable:true})
 const panel=new BrowserWindow({width:400,height:540,show:false,frame:false})
 win.setBounds({x:a.x+a.width-190,y:a.y+a.height-190,width:170,height:170})
 for(const scale of [.5,1,1.5,2,1]) {
  w.applyCatWindowLayout(win,scale);w.positionHoverCard(panel,win)
  const p=w.getPetBounds(win),b=panel.getBounds()
  assert.ok(b.x+b.width<=p.x||b.x>=p.x+p.width||b.y+b.height<=p.y||b.y>=p.y+p.height,JSON.stringify({scale,p,b}))
 }
 console.log('Native panel/pet overlap checks passed at 50%, 100%, 150%, 200%, 100%.')
 panel.destroy();win.destroy(); app.exit(0)
}).catch(e=>{console.error(e);app.exit(1)})
