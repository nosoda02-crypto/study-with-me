#!/bin/zsh
set -eu
unsetopt BG_NICE
project_dir="${0:A:h:h}"
pid_file="$project_dir/.study-with-me-dev.pid"
log_file="$project_dir/.study-with-me-dev.log"
electron_app="$project_dir/node_modules/electron/dist/Electron.app"
electron_bin="$electron_app/Contents/MacOS/Electron"
if [[ -f "$pid_file" ]]; then
  running_pid="$(<"$pid_file")"
  if kill -0 "$running_pid" 2>/dev/null; then
    echo "Study With Me 已在后台运行（PID $running_pid）"
    exit 0
  fi
fi
existing_pid="$(pgrep -f "$electron_bin $project_dir" | head -n 1 || true)"
if [[ -n "$existing_pid" ]] && kill -0 "$existing_pid" 2>/dev/null; then
  # A second launch asks the existing single instance to reveal the pet.
  open -na "$electron_app" --args "$project_dir"
  echo "$existing_pid" >"$pid_file"
  echo "Study With Me 已在独立运行，并已要求显示窗口（PID $existing_pid）"
  exit 0
fi
if [[ ! -x "$electron_bin" || ! -f "$project_dir/out/main/index.js" ]]; then
  echo "缺少本地运行文件，请先执行 npm run build。" >&2
  exit 1
fi
: >"$log_file"
# Launch Services owns the app process, so closing Codex or Terminal will not
# terminate the desktop pet. The absolute project path also avoids cwd issues.
open -na "$electron_app" --args "$project_dir"
app_pid=""
for _ in {1..40}; do
  app_pid="$(pgrep -f "$electron_bin $project_dir" | head -n 1 || true)"
  [[ -n "$app_pid" ]] && break
  sleep 0.1
done
if [[ -z "$app_pid" ]]; then
  echo "Study With Me 启动失败。" >&2
  exit 1
fi
echo "$app_pid" >"$pid_file"
echo "Study With Me 已独立启动（PID $app_pid），可以关闭 Codex 和终端。"
echo "日志：$log_file"
