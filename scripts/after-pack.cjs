// electron-builder afterPack hook (macOS): drop Chromium locale packs we never
// use, then ad-hoc re-sign so the trimmed Electron framework stays valid.
// A real Developer ID signature, if configured, is applied after this hook.
const { readdirSync, rmSync, existsSync } = require('fs')
const { join } = require('path')
const { execFileSync } = require('child_process')

const KEEP = new Set(['en.lproj', 'zh_CN.lproj', 'zh_TW.lproj'])

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const resources = join(app, 'Contents/Frameworks/Electron Framework.framework/Versions/A/Resources')
  if (!existsSync(resources)) return
  for (const entry of readdirSync(resources)) {
    if (entry.endsWith('.lproj') && !KEEP.has(entry)) rmSync(join(resources, entry), { recursive: true, force: true })
  }
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
}
